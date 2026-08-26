from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class MediaBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MediaCreate(MediaBase):
    pass


class MediaResponse(MediaBase):
    id: str
