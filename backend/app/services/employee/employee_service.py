from typing import List, Optional, Tuple
import random
import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    BusinessLogicException,
)
from app.core.security import hash_password
from app.dependencies import get_user_roles_and_permissions
from app.models.auth.user import UserModel
from app.models.employee.employee import EmployeeProfileModel
from app.models.employee.department import DepartmentModel
from app.models.employee.section import SectionModel
from app.models.employee.attendance import AttendanceModel
from app.models.employee.performance import PerformanceModel
from app.models.employee.target import TargetModel
from app.models.rbac.role import RoleModel
from app.models.rbac.user_role import UserRoleModel
from app.repositories.employee.employee_repository import EmployeeRepository
from app.schemas.employee.employee import (
    EmployeeCreateRequest,
    EmployeeUpdateRequest,
    EmployeeStatusRequest,
    ResetEmployeePasswordRequest,
    EmployeePermissionsRequest,
)
from app.schemas.employee.attendance import AttendanceCreateRequest, AttendanceUpdateRequest
from app.schemas.employee.performance import (
    PerformanceCreateRequest,
    PerformanceUpdateRequest,
    TargetCreateRequest,
    TargetUpdateRequest,
)
from app.schemas.employee.department import (
    DepartmentCreateRequest,
    DepartmentUpdateRequest,
    SectionCreateRequest,
    SectionUpdateRequest,
)

# ---------------------------------------------------------------------------
# Role → employee-code prefix mapping (from spec AUTHORIZATION_MATRIX.md)
# ---------------------------------------------------------------------------
ROLE_CODE_PREFIX: dict[str, str] = {
    "SUPER_ADMIN":       "ADM",
    "STORE_MANAGER":     "MGR",
    "SALES_EXECUTIVE":   "SLS",
    "INVENTORY_MANAGER": "INV",
    "INVENTORY_STAFF":   "INV",
    "WAREHOUSE_STAFF":   "WHS",
    "CUSTOMER_SUPPORT":  "CS",
    "FASHION_STYLIST":   "STY",
    # account levels (unified hierarchy) — admin-domain codes use the ADM prefix
    "ADMIN":             "ADM",
    "SUPER_EMPLOYEE":    "SUP",
    "EMPLOYEE":          "EMP",
}

# Employee statuses that permit login (from AUTHORIZATION_MATRIX.md §1)
LOGINABLE_STATUSES = {"ACTIVE", "PENDING", "ON_LEAVE"}


def _creator_account_level(creator: UserModel, creator_roles: Optional[list] = None) -> Optional[str]:
    """Authoritative account level of the acting creator (column, else derivation)."""
    level = getattr(creator, "account_level", None)
    if level:
        return str(level).upper()
    from app.core.rbac import derive_account_level

    return derive_account_level(creator.user_type, creator_roles or [])


async def _require_target_manageable(
    session: AsyncSession, creator: UserModel, creator_roles: Optional[list], target_user_id: str
) -> UserModel:
    """
    Load the staff target of a People-domain operation and enforce the
    account-hierarchy ceiling (§28): a creator may only act on account levels
    they are allowed to create; nobody below SUPER_ADMIN touches SUPER_ADMIN
    accounts. Returns the target UserModel.
    """
    from app.core.rbac import can_manage

    res = await session.execute(
        select(UserModel)
        .where(UserModel.id == target_user_id)
        .options(selectinload(UserModel.employee_profile))
    )
    target = res.scalars().first()
    if not target:
        raise NotFoundException("Employee not found.")
    creator_level = _creator_account_level(creator, creator_roles or [])
    target_level = _creator_account_level(target)
    if not can_manage(creator_level, target_level):
        raise ForbiddenException(
            f"A {creator_level or 'staff'} account cannot manage a {target_level or 'non-staff'} account."
        )
    return target


def _generate_temp_password(length: int = 12) -> str:
    """Generate a secure random temporary password."""
    alphabet = string.ascii_letters + string.digits + "!@#$"
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _next_employee_code(session: AsyncSession, role: Optional[str]) -> str:
    """
    Generate a unique employee code in format PF-<PREFIX>-#####.
    Prefix derived from the role per ROLE_CODE_PREFIX; falls back to 'EMP'.
    """
    prefix = ROLE_CODE_PREFIX.get((role or "").upper(), "EMP")
    for _ in range(20):  # retry up to 20 times on collision
        number = random.randint(10000, 99999)
        code = f"PF-{prefix}-{number:05d}"
        res = await session.execute(
            select(EmployeeProfileModel).where(EmployeeProfileModel.employee_code == code)
        )
        if res.scalars().first() is None:
            return code
    raise BusinessLogicException("Could not generate a unique employee ID.")


class EmployeeService:
    """Business logic for employee management (admin-only operations)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EmployeeRepository(db)

    # ------------------------------------------------------------------ #
    #  Employee CRUD                                                       #
    # ------------------------------------------------------------------ #

    async def create_employee(
        self, req: EmployeeCreateRequest, creator_id: str
    ) -> tuple[UserModel, Optional[str]]:
        """
        Onboard a staff account at any of the four authorized levels.

        The server (not the UI) enforces the account-creation hierarchy and
        the least-privilege delegation ceiling:

          • creator level must be allowed to create the requested level
            (SUPER_ADMIN → all four; ADMIN → ADMIN/SUPER_EMPLOYEE/EMPLOYEE;
            SUPER_EMPLOYEE → SUPER_EMPLOYEE/EMPLOYEE; EMPLOYEE → none);
          • requested capabilities must be delegable by the creator
            (SUPER_ADMIN unlimited; everyone else ⊆ own effective set;
            SUPER_EMPLOYEE further bounded to the employee domain);
          • business roles are the existing PredefinedRole catalogue — never
            an elevation path into Admin authority.

        Returns (user, one-time temporary password) — the password is only
        ever present in the create response, never stored in plaintext.
        """
        from app.core.rbac import (
            ACCOUNT_LEVEL_EMPLOYEE,
            LEVEL_USER_TYPE,
            canonical_role_name,
            check_delegation,
            expand_effective_permissions,
            normalize_grants,
        )

        target_level = (req.accountLevel or ACCOUNT_LEVEL_EMPLOYEE).upper()
        if target_level not in LEVEL_USER_TYPE:
            from app.core.exceptions import BusinessLogicException

            raise BusinessLogicException(
                f"Unknown account level '{req.accountLevel}'. Expected SUPER_ADMIN, ADMIN, SUPER_EMPLOYEE or EMPLOYEE."
            )

        creator = await self.db.get(UserModel, creator_id)
        if not creator:
            raise ForbiddenException("Account manager session is no longer valid.")
        creator_roles, creator_permissions = await get_user_roles_and_permissions(creator, self.db)
        creator_level = _creator_account_level(creator, creator_roles)
        check_delegation(creator_level, target_level, [], set(creator_permissions))
        # A creator may never hand out capabilities above their own ceiling.
        requested = normalize_grants(req.permissions or [])
        check_delegation(creator_level, target_level, requested, set(creator_permissions))

        # Uniqueness checks
        if req.email and await self.repo.email_exists(req.email):
            raise ConflictException("An account with this email already exists.")
        if req.phone and await self.repo.phone_exists(req.phone):
            raise ConflictException("An account with this phone number already exists.")
        if req.employee_code and await self.repo.employee_code_exists(req.employee_code):
            raise ConflictException(f"Employee code '{req.employee_code}' is already in use.")

        # Validate department/section if provided
        if req.department_id:
            dept = await self.repo.get_department(req.department_id)
            if not dept:
                raise NotFoundException("Department not found.")
        if req.section_id:
            section = await self.repo.get_section(req.section_id)
            if not section:
                raise NotFoundException("Section not found.")

        is_employee_domain = target_level in ("SUPER_EMPLOYEE", "EMPLOYEE")
        temp_password = req.password or _generate_temp_password()

        user = UserModel(
            email=req.email,
            phone=req.phone,
            full_name=req.full_name,
            hashed_password=hash_password(temp_password),
            user_type=LEVEL_USER_TYPE[target_level],
            account_level=target_level,
            status="ACTIVE",
            is_verified=True,
            force_password_change=True,   # must change password on first login
        )
        self.db.add(user)
        await self.db.flush()

        business_role = canonical_role_name(req.role) if req.role else None

        if is_employee_domain:
            profile = EmployeeProfileModel(
                user_id=user.id,
                employee_code=req.employee_code or await _next_employee_code(
                    self.db, business_role or target_level
                ),
                designation=req.designation or (business_role or "").replace("_", " ").title() or "Employee",
                department=req.department,
                department_id=req.department_id,
                section_id=req.section_id,
            )
            self.db.add(profile)
        elif req.employee_code:
            from app.core.exceptions import BusinessLogicException

            raise BusinessLogicException(
                "Admin-domain accounts do not carry an employee code."
            )

        # Role + capability assignment (hierarchy role is authoritative via
        # users.account_level; role rows carry the operational grants).
        role_names: list[str] = []
        if target_level == "SUPER_ADMIN":
            role_names.append("SUPER_ADMIN")
        elif target_level == "ADMIN":
            role_names.append("ADMIN")
        elif is_employee_domain and business_role:
            role_names.append(business_role)

        for role_name in role_names:
            role = await self._get_or_create_role(role_name)
            if role:
                self.db.add(UserRoleModel(user_id=user.id, role_id=role.id))

        if req.permissionMode == "custom" or (requested and not is_employee_domain):
            # Explicit capability assignment: store the canonical/legacy
            # grant list. Custom mode replaces role defaults by design.
            if requested:
                user.permission_mode = "custom"
                user.custom_permissions = requested
        await self.db.commit()
        await self.db.refresh(user)

        from app.dependencies import invalidate_rbac_cache

        await invalidate_rbac_cache(user.id)

        loaded = await self.repo.get_any_staff_by_id(user.id) or user
        return loaded, temp_password

    async def _get_or_create_role(self, name: str) -> Optional[RoleModel]:
        """Get-or-create a system role row (deterministic, additive only)."""
        res = await self.db.execute(select(RoleModel).where(RoleModel.name == name))
        role = res.scalars().first()
        if role:
            return role
        role = RoleModel(name=name, description=f"System role: {name.replace('_', ' ').title()}", is_system=True)
        self.db.add(role)
        await self.db.flush()
        return role

    async def get_employee(self, user_id: str) -> UserModel:
        """Load any staff account (employee-domain or admin-domain)."""
        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")
        return user

    async def list_employees(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[str] = None,
        department_id: Optional[str] = None,
        include_admins: bool = False,
        actor_id: Optional[str] = None,
    ) -> Tuple[List[UserModel], int]:
        skip = (page - 1) * page_size

        # include_admins is honored only for admin-workspace actors; below
        # SUPER_ADMIN the roster hides system-owner accounts (§27: no
        # enumeration of authority one cannot manage).
        actor_level = None
        if actor_id:
            actor = await self.db.get(UserModel, actor_id)
            if actor is not None:
                actor_level = _creator_account_level(actor)
                if not actor_level:
                    roles, _p = await get_user_roles_and_permissions(actor, self.db)
                    actor_level = _creator_account_level(actor, roles)
        if actor_level not in ("SUPER_ADMIN", "ADMIN"):
            include_admins = False
        return await self.repo.list_employees(
            skip=skip,
            limit=page_size,
            search=search,
            status=status,
            department_id=department_id,
            include_admins=include_admins,
            exclude_super_admins=include_admins and actor_level != "SUPER_ADMIN",
        )

    async def _resolve_actor(self, actor_id: Optional[str]):
        """Creator context for hierarchy checks (None when unattended, e.g. tests)."""
        if not actor_id:
            return None, None
        actor = await self.db.get(UserModel, actor_id)
        if not actor:
            raise ForbiddenException("Account manager session is no longer valid.")
        roles, _permissions = await get_user_roles_and_permissions(actor, self.db)
        return actor, roles

    async def update_employee(
        self, user_id: str, req: EmployeeUpdateRequest, actor_id: Optional[str] = None
    ) -> UserModel:
        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")
        actor, actor_roles = await self._resolve_actor(actor_id)
        if actor is not None:
            await _require_target_manageable(self.db, actor, actor_roles, user.id)

        if req.full_name is not None:
            user.full_name = req.full_name
        if req.phone is not None:
            if req.phone != user.phone and await self.repo.phone_exists(req.phone):
                raise ConflictException("This phone number is already in use.")
            user.phone = req.phone

        # ── Account level change (hierarchy-sensitive) ──────────────────────
        if req.accountLevel is not None:
            from app.core.rbac import ACCOUNT_LEVELS, LEVEL_USER_TYPE, can_create

            target = req.accountLevel.upper()
            if target not in ACCOUNT_LEVELS:
                raise BusinessLogicException(
                    f"Unknown account level '{req.accountLevel}'."
                )
            creator_level = _creator_account_level(actor, actor_roles) if actor else None
            if not can_create(creator_level, target):
                raise ForbiddenException(
                    f"A {creator_level or 'system'} account cannot move accounts to {target} level."
                )
            user.account_level = target
            user.user_type = LEVEL_USER_TYPE[target]

        # ── Business role change (operational responsibility, not authority) ──
        if req.role is not None:
            from app.core.rbac import BUSINESS_ROLE_NAMES, canonical_role_name

            new_role = canonical_role_name(req.role) if req.role else None
            if new_role and new_role not in BUSINESS_ROLE_NAMES:
                raise BusinessLogicException(f"Unknown business role '{req.role}'.")
            await self._reassign_business_roles(user, new_role)

        profile = user.employee_profile
        if profile:
            if req.designation is not None:
                profile.designation = req.designation
            if req.department is not None:
                profile.department = req.department
            if req.department_id is not None:
                dept = await self.repo.get_department(req.department_id)
                if not dept:
                    raise NotFoundException("Department not found.")
                profile.department_id = req.department_id
            if req.section_id is not None:
                section = await self.repo.get_section(req.section_id)
                if not section:
                    raise NotFoundException("Section not found.")
                profile.section_id = req.section_id

        await self.db.commit()
        from app.dependencies import invalidate_rbac_cache

        await invalidate_rbac_cache(user.id)
        return await self.repo.get_any_staff_by_id(user_id)

    async def _reassign_business_roles(self, user: UserModel, role_name: Optional[str]) -> None:
        """Replace the user's business-role rows (SUPER_ADMIN/ADMIN level rows untouched)."""
        from app.core.rbac import BUSINESS_ROLE_NAMES, canonical_role_name

        rows = (
            await self.db.execute(
                select(UserRoleModel, RoleModel.name)
                .join(RoleModel, RoleModel.id == UserRoleModel.role_id)
                .where(UserRoleModel.user_id == user.id)
            )
        ).all()
        for ur, rname in rows:
            if canonical_role_name(rname) in BUSINESS_ROLE_NAMES:
                await self.db.delete(ur)
        await self.db.flush()
        if role_name:
            role = await self._get_or_create_role(role_name)
            self.db.add(UserRoleModel(user_id=user.id, role_id=role.id))

    async def update_employee_status(
        self, user_id: str, req: EmployeeStatusRequest, actor_id: Optional[str] = None
    ) -> UserModel:
        allowed = {"ACTIVE", "SUSPENDED", "DEACTIVATED"}
        if req.status not in allowed:
            raise BusinessLogicException(f"Invalid status. Must be one of: {', '.join(allowed)}")

        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")
        actor, actor_roles = await self._resolve_actor(actor_id)
        if actor is not None:
            await _require_target_manageable(self.db, actor, actor_roles, user.id)

        user.status = req.status
        await self.db.commit()
        await self.db.refresh(user)
        return await self.repo.get_any_staff_by_id(user_id)

    async def reset_employee_password(
        self, user_id: str, req: ResetEmployeePasswordRequest, actor_id: Optional[str] = None
    ) -> Optional[str]:
        """
        Admin-initiated credential reset. Returns the generated temporary
        password when none was supplied (one-time in the response — never
        stored in plaintext), so the credential sheet shows a real credential.
        """
        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")
        actor, actor_roles = await self._resolve_actor(actor_id)
        if actor is not None:
            await _require_target_manageable(self.db, actor, actor_roles, user.id)

        temp_password = req.new_password or _generate_temp_password()
        user.hashed_password = hash_password(temp_password)
        user.force_password_change = req.force_change
        await self.db.commit()
        return temp_password

    async def update_employee_permissions(
        self, user_id: str, req: EmployeePermissionsRequest, actor_id: Optional[str] = None
    ) -> UserModel:
        """
        PUT /admin/employees/{id}/permissions — real persistence (previously a
        no-op TODO). Stores permission_mode + the explicit grant list on the
        user row; the shared RBAC resolver expands legacy codes and canonical
        capabilities in both directions.

        Enforced here (§7/§28):
          • the caller's delegable set — nobody grants capabilities they do not
            hold; SUPER_EMPLOYEE creators are bounded to the employee domain;
          • SUPER_ADMIN keeps the top-level override regardless of overrides.
        """
        from app.core.rbac import (
            ACCOUNT_LEVEL_SUPER_ADMIN,
            check_delegation,
            normalize_grants,
        )

        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")

        if req.permissionMode not in ("role", "custom"):
            raise BusinessLogicException("permissionMode must be 'role' or 'custom'.")

        actor, actor_roles = await self._resolve_actor(actor_id)
        requested = normalize_grants(req.permissions or [])
        if actor is not None:
            await _require_target_manageable(self.db, actor, actor_roles, user.id)
            _actor_roles2, actor_permissions = await get_user_roles_and_permissions(actor, self.db)
            check_delegation(
                _creator_account_level(actor, actor_roles),
                _creator_account_level(user) or "EMPLOYEE",
                requested,
                set(actor_permissions),
            )
        else:
            _a, _p = await get_user_roles_and_permissions(user, self.db)
            check_delegation(
                ACCOUNT_LEVEL_SUPER_ADMIN,  # unattended (scripted) updates keep full authority
                _creator_account_level(user) or "EMPLOYEE",
                requested,
                set(_p),
            )

        user.permission_mode = req.permissionMode
        user.custom_permissions = requested if req.permissionMode == "custom" else None
        await self.db.commit()
        from app.dependencies import invalidate_rbac_cache

        await invalidate_rbac_cache(user.id)
        return await self.repo.get_any_staff_by_id(user_id)

    async def delete_employee(self, user_id: str, actor_id: Optional[str] = None) -> bool:
        user = await self.repo.get_any_staff_by_id(user_id)
        if not user:
            raise NotFoundException("Employee not found.")
        actor, actor_roles = await self._resolve_actor(actor_id)
        if actor is not None:
            if actor.id == user.id:
                raise BusinessLogicException("You cannot delete your own account.")
            await _require_target_manageable(self.db, actor, actor_roles, user.id)
        await self.db.delete(user)
        await self.db.commit()
        from app.dependencies import invalidate_rbac_cache

        await invalidate_rbac_cache(user_id)
        return True

    # ------------------------------------------------------------------ #
    #  Department                                                          #
    # ------------------------------------------------------------------ #

    async def create_department(self, req: DepartmentCreateRequest) -> DepartmentModel:
        existing = await self.repo.get_department_by_name(req.name)
        if existing:
            raise ConflictException(f"Department '{req.name}' already exists.")
        dept = DepartmentModel(name=req.name, description=req.description)
        self.db.add(dept)
        await self.db.commit()
        await self.db.refresh(dept)
        return dept

    async def list_departments(self) -> List[DepartmentModel]:
        return await self.repo.list_departments()

    async def get_department(self, dept_id: str) -> DepartmentModel:
        dept = await self.repo.get_department(dept_id)
        if not dept:
            raise NotFoundException("Department not found.")
        return dept

    async def update_department(self, dept_id: str, req: DepartmentUpdateRequest) -> DepartmentModel:
        dept = await self.repo.get_department(dept_id)
        if not dept:
            raise NotFoundException("Department not found.")
        if req.name is not None:
            dept.name = req.name
        if req.description is not None:
            dept.description = req.description
        if req.is_active is not None:
            dept.is_active = req.is_active
        await self.db.commit()
        await self.db.refresh(dept)
        return dept

    async def delete_department(self, dept_id: str) -> bool:
        dept = await self.repo.get_department(dept_id)
        if not dept:
            raise NotFoundException("Department not found.")
        await self.db.delete(dept)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------ #
    #  Section                                                             #
    # ------------------------------------------------------------------ #

    async def create_section(self, req: SectionCreateRequest) -> SectionModel:
        dept = await self.repo.get_department(req.department_id)
        if not dept:
            raise NotFoundException("Department not found.")
        section = SectionModel(
            department_id=req.department_id, name=req.name, description=req.description
        )
        self.db.add(section)
        await self.db.commit()
        await self.db.refresh(section)
        return section

    async def list_sections(self, department_id: Optional[str] = None) -> List[SectionModel]:
        return await self.repo.list_sections(department_id)

    async def get_section(self, section_id: str) -> SectionModel:
        section = await self.repo.get_section(section_id)
        if not section:
            raise NotFoundException("Section not found.")
        return section

    async def update_section(self, section_id: str, req: SectionUpdateRequest) -> SectionModel:
        section = await self.repo.get_section(section_id)
        if not section:
            raise NotFoundException("Section not found.")
        if req.name is not None:
            section.name = req.name
        if req.description is not None:
            section.description = req.description
        if req.is_active is not None:
            section.is_active = req.is_active
        await self.db.commit()
        await self.db.refresh(section)
        return section

    async def delete_section(self, section_id: str) -> bool:
        section = await self.repo.get_section(section_id)
        if not section:
            raise NotFoundException("Section not found.")
        await self.db.delete(section)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------ #
    #  Attendance                                                          #
    # ------------------------------------------------------------------ #

    async def create_attendance(self, req: AttendanceCreateRequest) -> AttendanceModel:
        # Validate employee exists
        emp_profile = await self._get_profile(req.employee_id)
        record = AttendanceModel(
            employee_id=emp_profile.id,
            attendance_date=req.attendance_date,
            check_in=req.check_in,
            check_out=req.check_out,
            status=req.status,
            notes=req.notes,
        )
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        return record

    async def list_attendance(
        self, employee_id: str, page: int = 1, page_size: int = 30
    ) -> Tuple[List[AttendanceModel], int]:
        profile = await self._get_profile(employee_id)
        skip = (page - 1) * page_size
        return await self.repo.list_attendance(profile.id, skip, page_size)

    async def update_attendance(
        self, attendance_id: str, req: AttendanceUpdateRequest
    ) -> AttendanceModel:
        record = await self.repo.get_attendance(attendance_id)
        if not record:
            raise NotFoundException("Attendance record not found.")
        if req.check_in is not None:
            record.check_in = req.check_in
        if req.check_out is not None:
            record.check_out = req.check_out
        if req.status is not None:
            record.status = req.status
        if req.notes is not None:
            record.notes = req.notes
        await self.db.commit()
        await self.db.refresh(record)
        return record

    async def delete_attendance(self, attendance_id: str) -> bool:
        record = await self.repo.get_attendance(attendance_id)
        if not record:
            raise NotFoundException("Attendance record not found.")
        await self.db.delete(record)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------ #
    #  Targets                                                             #
    # ------------------------------------------------------------------ #

    async def create_target(self, req: TargetCreateRequest) -> TargetModel:
        profile = await self._get_profile(req.employee_id)
        if req.period_end <= req.period_start:
            raise BusinessLogicException("period_end must be after period_start.")
        target = TargetModel(
            employee_id=profile.id,
            period_start=req.period_start,
            period_end=req.period_end,
            target_amount=req.target_amount,
            target_type=req.target_type,
            notes=req.notes,
        )
        self.db.add(target)
        await self.db.commit()
        await self.db.refresh(target)
        return target

    async def list_targets(
        self, employee_id: str, page: int = 1, page_size: int = 20
    ) -> Tuple[List[TargetModel], int]:
        profile = await self._get_profile(employee_id)
        skip = (page - 1) * page_size
        return await self.repo.list_targets(profile.id, skip, page_size)

    async def update_target(self, target_id: str, req: TargetUpdateRequest) -> TargetModel:
        target = await self.repo.get_target(target_id)
        if not target:
            raise NotFoundException("Target not found.")
        if req.target_amount is not None:
            target.target_amount = req.target_amount
        if req.achieved_amount is not None:
            target.achieved_amount = req.achieved_amount
        if req.target_type is not None:
            target.target_type = req.target_type
        if req.notes is not None:
            target.notes = req.notes
        await self.db.commit()
        await self.db.refresh(target)
        return target

    async def delete_target(self, target_id: str) -> bool:
        target = await self.repo.get_target(target_id)
        if not target:
            raise NotFoundException("Target not found.")
        await self.db.delete(target)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------ #
    #  Performance                                                         #
    # ------------------------------------------------------------------ #

    async def create_performance(
        self, req: PerformanceCreateRequest, reviewer_id: str
    ) -> PerformanceModel:
        profile = await self._get_profile(req.employee_id)
        review = PerformanceModel(
            employee_id=profile.id,
            review_date=req.review_date,
            rating=req.rating,
            review_period=req.review_period,
            reviewer_id=reviewer_id,
            comments=req.comments,
        )
        self.db.add(review)
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def list_performance(
        self, employee_id: str, page: int = 1, page_size: int = 20
    ) -> Tuple[List[PerformanceModel], int]:
        profile = await self._get_profile(employee_id)
        skip = (page - 1) * page_size
        return await self.repo.list_performance(profile.id, skip, page_size)

    async def update_performance(
        self, perf_id: str, req: PerformanceUpdateRequest
    ) -> PerformanceModel:
        review = await self.repo.get_performance(perf_id)
        if not review:
            raise NotFoundException("Performance review not found.")
        if req.rating is not None:
            review.rating = req.rating
        if req.review_period is not None:
            review.review_period = req.review_period
        if req.comments is not None:
            review.comments = req.comments
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def delete_performance(self, perf_id: str) -> bool:
        review = await self.repo.get_performance(perf_id)
        if not review:
            raise NotFoundException("Performance review not found.")
        await self.db.delete(review)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    async def _get_profile(self, employee_user_id: str) -> EmployeeProfileModel:
        """Resolve employee user_id → EmployeeProfileModel, raising 404 if not found."""
        user = await self.repo.get_employee_by_id(employee_user_id)
        if not user or not user.employee_profile:
            raise NotFoundException("Employee not found.")
        return user.employee_profile
