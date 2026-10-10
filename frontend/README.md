# RentalVerify — House Rental Management System

RentalVerify is a web application for managing rental properties and rent payments. It provides role-based workspaces for tenants, landlords, area administrators, and platform administrators.

## Technology Stack

### Frontend
- React 18
- React Router
- Axios
- Leaflet and React Leaflet
- Create React App

### Backend
- Node.js and Express
- MongoDB and Mongoose
- JWT authentication
- Chapa payment and transfer integration
- Cloudinary and Multer for file handling

## Project Structure

```text
rental-verifay/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── ...
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── .env.development
│   ├── .env.production
│   └── README.md
└── .gitignore
```

## Requirements

- Node.js and npm
- MongoDB
- Chapa credentials for payment integration
- Cloudinary credentials if using Cloudinary uploads

## Run Locally

Open two PowerShell terminals from the project root.

### 1. Start the backend

```powershell
cd backend
npm.cmd install
npm.cmd start
```

For development with automatic restarts:

```powershell
npm.cmd run dev
```

The backend uses `server.js`. Configure its required environment variables in `backend/.env`. Do not commit secrets to Git.

### 2. Start the frontend

In the second terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000).

The backend normally runs locally at `http://localhost:5000`. The frontend package proxy points to this backend.

## Frontend Environment Configuration

The frontend uses environment-specific API URLs:

- `.env.development`: `REACT_APP_API_URL=http://localhost:5000`
- `.env.production`: `REACT_APP_API_URL=https://rental-verifay.onrender.com`

If the backend URL changes, update the appropriate environment file and rebuild or redeploy the frontend. Frontend environment variables are public; never store API secrets in them.

### Property image and ownership-proof uploads

Property images and proof-of-ownership files are uploaded by the backend to Cloudinary. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as backend-only environment variables in Render, using credentials from the same Cloudinary account. Never add these credentials to Vercel, a `REACT_APP_*` variable, or source control. Set `REACT_APP_API_URL` in Vercel to the deployed backend URL and rebuild the frontend after changing it.

For local development, put the Cloudinary values in the ignored `backend/.env`. When credentials are absent locally, uploads retain the existing local-storage development fallback. In production, missing Cloudinary credentials stop uploads with a configuration error rather than saving files to ephemeral local storage. If Cloudinary rejects credentials, replace them with the current account values and redeploy the backend.

## Tests and Production Build

Run frontend commands from `frontend/`:

```powershell
npm.cmd test
npm.cmd run build
```

Run backend tests from `backend/`:

```powershell
npm.cmd test
```

## Rent Payments and Chapa Transfers

The tenant rent-payment flow uses Chapa for checkout and backend payment verification.

- A payment must be verified by the backend before it is recorded as paid.
- A verified rent payment credits the landlord associated with the rented property.
- Rent-credit and transfer processing must be idempotent to prevent duplicate credits or transfers.
- A landlord's saved bank-account details are associated with the authenticated landlord. Account numbers should remain encrypted at rest and masked in frontend responses.
- A transfer is marked `EXECUTED` only after Chapa confirms the expected reference, amount, currency, and successful transfer status.
- Sandbox transfers simulate provider outcomes and do not move real bank funds. They must not be represented as completed real payouts.
- Failed, pending, or unverified transfers must not be displayed as successfully executed.

### Live Payout Requirements

Live transfers require the appropriate backend-only Chapa credentials, live payment configuration, a supported bank code, sufficient eligible provider balance, and any required Chapa dashboard approval settings.

Configure required secrets only in the backend environment, such as the hosting provider's environment settings or the local `backend/.env`. Never put Chapa secret keys or transfer-approval secrets in frontend variables or source control.

Refer to the official [Chapa Transfers documentation](https://developer.chapa.co/transfer/transfers) for provider requirements.

## Deployment

- Frontend: [Vercel](https://rental-verifay.vercel.app)
- Backend: [Render](https://rental-verifay.onrender.com)

Configure the frontend production API URL to point to the deployed backend. Configure backend environment variables in Render and redeploy after changing them. Do not expose secrets in the frontend or commit `.env` files containing credentials.

## Security Notes

- Never commit API keys, JWT secrets, database credentials, or payment-provider secrets.
- Keep authentication and authorization checks on the backend.
- Verify payment and transfer results on the backend; do not trust a browser redirect alone.
- Do not treat sandbox results as real money transfers.
- Do not use real customer bank details in test-mode configuration.

## License

This project currently uses the license metadata specified in its package configuration. Check with the project owner before redistributing or relicensing it.
