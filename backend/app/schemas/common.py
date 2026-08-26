from typing import Any, Optional, Generic, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class BaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    success: bool = True
    message: Optional[str] = None


class DataResponse(BaseResponse, Generic[T]):
    data: T


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
