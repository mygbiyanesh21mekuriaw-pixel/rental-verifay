# House Rental Management System

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

## API configuration

The frontend uses environment-specific API URLs:

- `npm start` loads `.env.development` and connects to `http://localhost:5000`.
- `npm run build` loads `.env.production` and connects to `https://rental-verifay.onrender.com`.

For a different deployment backend, set `REACT_APP_API_URL` in the Render frontend service's environment variables and redeploy. This value is public frontend configuration; never put API secrets in frontend environment variables.

Chapa bank lookup and payments require `CHAPA_SECRET_KEY` on the backend service. For Render, add it under the backend web service's Environment settings, then restart or redeploy the backend. Do not add this secret to the frontend service.

Landlord banking is simulated entirely inside this university demo. The backend issues a unique numeric account number whose exact length, numeric format, and optional prefix come from the central `backend/config/demoBanks.js` configuration, stores it in a dedicated virtual-account collection, and maintains an ETB balance and payment-credit history. New CBE demo numbers use the configured `100` prefix and total 13 digits. Existing accounts and payment-history references are not renumbered. The account number is always labeled **DEMO ACCOUNT** in the interface. Each bank has an independent sequence; MongoDB's unique account-number index rejects collisions across banks, and the generator retries with the next sequence. These are internal simulation formats only, not claims about any real institution's account-number format; no real bank account number is requested or created, and the virtual account does not connect to CBE or any other financial institution. CBE is configured as 13 digits and Awash as 14; other entries are internal demo lengths that can be changed in that configuration file.

Chapa remains the tenant rent checkout and payment-verification provider. Once Chapa confirms a payment and the application records it as paid, the backend atomically increments the landlord's demo balance and appends the credit-history record in one account-document update, preventing duplicate credits without requiring MongoDB replica-set transactions. The platform admin can view demo accounts at **Admin Dashboard → Demo Bank Accounts**. Chapa credentials remain backend-only and are used for tenant payments, not for bank-account creation or transfers.

Demo bank API (all landlord endpoints require authentication):

- `GET /api/bank-accounts/demo/banks` — internal demo bank options.
- `POST /api/bank-accounts/demo` with `{ "bankCode": "CBE" }` — create or return the landlord's one active demo account; the server uses the authenticated landlord's profile name.
- `GET /api/bank-accounts/my-account` and `GET /api/bank-accounts/my-account/balance` — account and balance.
- `GET /api/bank-accounts/my-account/transactions` — confirmed rent credits.
- `GET /api/admin/demo-bank-accounts` — platform-admin demo account list.

No seed or new environment variable is required. Account counters and accounts are created automatically in MongoDB. Configure the existing backend Chapa settings to use checkout and payment verification; the internal demo balance is credited only after verification succeeds.

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
