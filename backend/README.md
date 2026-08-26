# PRATIKSHYA FASHON — Feature-Based Backend API

Modular FastAPI application backing the PRATIKSHYA FASHON ladies-priority retail platform.

## Features & Modules

- **Authentication & Identity**: JWT-based login for Customer, Employee, and Admin surfaces.
- **RBAC & Permissions**: Dynamic roles & fine-grained permission checks.
- **Product Catalog & Variants**: Authoritative single source of truth for products, variants, and attributes.
- **Pricing & Tax**: Server-validated prices, discounts, GST calculation.
- **Media & Review**: Media asset upload, approval workflow, and CDN delivery.
- **Cart, Wishlist & Coupons**: Shopping cart, coupon validations, wishlist management.
- **Checkout & Payments**: Order creation and Razorpay gateway integration.
- **Orders & Returns**: Order lifecycle, immutable snapshots, and return workflows.
- **Inventory & Warehouse**: Stock tracking, reservations, multi-warehouse transfers.
- **Employee Operations**: Attendance tracking, sales targets, performance scores.
- **AI RAG Chatbot**: Shopping assistant using LangChain, Groq/OpenAI, and pgvector.

## Project Structure

```
app/
├── api/v1/          # Modular API routers for all 18 feature domains
├── core/            # Infrastructure (database, security, rbac, errors, pagination)
├── models/          # SQLAlchemy async domain models
├── repositories/    # Data access layer
├── schemas/         # Pydantic validation schemas
├── services/        # Domain business logic services
├── ai/              # LLM providers, prompts, AI tools
├── rag/             # Vector retrieval, ingestion, context generation
└── workers/         # Celery background task workers
```

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Start services with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. Access Interactive API Documentation:
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

4. Run Database Migrations:
   ```bash
   alembic upgrade head
   ```
