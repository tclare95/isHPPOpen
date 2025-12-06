# Copilot Instructions for isHPPOpen

## Project Overview
Next.js 15 application for Holme Pierrepont whitewater course status. Displays water levels, events, and HPP open/closed status. Deployed on **Vercel**. Uses MongoDB for data, React Bootstrap for UI, SWR for real-time data fetching, and Auth0 via NextAuth for admin authentication.

## Architecture

### Data Flow
1. **API Routes** (`pages/api/`) → query MongoDB via `libs/database.js`
2. **Service Layer** (`libs/services/`) → encapsulates business logic with Yup validation (see `eventsService.js`)
3. **Frontend** → uses `libs/useFetch.js` (SWR wrapper) for data fetching with automatic revalidation

### External Integrations
- **S3 Forecast**: River level predictions fetched from S3 bucket via `pages/api/s3forecast.js` (CSV format, parsed to JSON)
- **Water Level Data**: Stored in `riverschemas` collection, served via `pages/api/levels.js`

### MongoDB Collections
| Collection | Purpose |
|------------|---------|
| `eventschemas` | Course closure events (name, dates, details) |
| `openIndicator` | Historical open/closed status records for stats |
| `riverschemas` | Water level readings and legacy forecast data |

### Key Patterns
- **Database Connection**: Uses singleton pattern with global caching in `libs/database.js` - always import `connectToDatabase` from there
- **API Routes**: Switch on HTTP method within single handler (see `pages/api/events.js` for GET/POST/DELETE pattern)
- **Auth Protection**: Use `getServerSession(req, res, authOptions)` from `next-auth/next` for protected endpoints. Admin access controlled via Auth0 configuration.
- **Form Validation**: Yup schemas in service layer (`libs/services/`) and Formik forms (`components/functional/eventsform.js`)

### Component Structure
```
components/
  functional/   # Interactive components (charts, forms, events)
  layout/       # Page structure components
    adminpage/  # Admin section layout (auth required)
    frontpage/  # Public site layout
```

## Development Commands
```bash
npm run dev    # Start development server
npm run test   # Run Jest tests
npm run build  # Production build (runs on Vercel)
```

## Testing Patterns

### API Route Tests
- Use `node-mocks-http` for request/response mocking
- Mock database via `jest.mock('../../libs/database')` 
- Mock services via `jest.mock('../../libs/services/eventsService')`
- Mock NextAuth: `jest.mock('next-auth/next')` and mock `pages/api/auth/[...nextauth]`
- Test files in `__tests__/api/` follow pattern `{route}-api.test.js`

### Component Tests  
- Use `@testing-library/react` for component rendering
- Mock `libs/useFetch` for data fetching
- Test files in `__tests__/` mirror component names

### Mock Structure
- `__mocks__/libs/database.js` - Pre-configured MongoDB mock with common operations
- `__mocks__/next-auth/next.js` - Session mocking for auth tests
- Requires `.env.test` file with `MONGODB_URI` and `MONGODB_DB` variables

## Environment Variables
Required in `.env.local` (and Vercel):
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB` - Database name
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_DOMAIN` - Auth0 credentials
- `SECRET` - NextAuth secret
- `S3_FORECAST_URL` - URL to S3 bucket with forecast CSV data

## Key Files Reference
- `libs/database.js` - MongoDB connection singleton
- `libs/useFetch.js` - SWR-based data fetching hook
- `libs/services/eventsService.js` - Events CRUD with validation
- `pages/api/events.js` - Full CRUD API example with auth
- `pages/api/s3forecast.js` - S3 forecast integration with CSV parsing
- `pages/api/hppstatus.js` - Closure statistics from openIndicator collection
- `components/functional/chart.js` - Google Charts integration pattern
- `libs/context/graphcontrol.js` - React Context for chart bounds
