import unittest
from app.core.security import hash_password, verify_password, create_access_token, decode_token


class TestAuthSecurity(unittest.TestCase):

    def test_password_hashing(self):
        raw_pwd = "SecretPassword123!"
        hashed = hash_password(raw_pwd)
        self.assertNotEqual(hashed, raw_pwd)
        self.assertTrue(verify_password(raw_pwd, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))

    def test_jwt_token_claims(self):
        user_id = "test-uuid-1234"
        token = create_access_token(
            subject=user_id,
            user_type="admin",
            extra_claims={"roles": ["SUPER_ADMIN"]},
        )
        payload = decode_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("sub"), user_id)
        self.assertEqual(payload.get("type"), "admin")
        self.assertIn("SUPER_ADMIN", payload.get("roles", []))


if __name__ == "__main__":
    unittest.main()
