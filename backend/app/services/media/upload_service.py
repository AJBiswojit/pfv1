class UploadService:
    """Business logic service for UploadService."""
    def __init__(self, db_session):
        self.db = db_session
