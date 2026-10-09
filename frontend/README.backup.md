# House Rental Management System

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

## API configuration

The frontend uses environment-specific API URLs:

- `npm start` loads `.env.development` and connects to `http://localhost:5000`.
- `npm run build` loads `.env.production` and connects to `https://rental-verifay.onrender.com`.

For a different deployment backend, set `REACT_APP_API_URL` in the Render frontend service's environment variables and redeploy. This value is public frontend configuration; never put API secrets in frontend environment variables.

Landlords register an existing bank account from **Landlord Workspace → Bank Information**. The account details are stored on the authenticated landlord's user record; the account number is encrypted at rest and only a masked number is returned to the frontend. Registration does not create an account at a bank. A landlord can update the same saved account; account details are never accepted for another landlord ID from the client.

Tenant rent checkout and payment verification use Chapa. Once a live-mode rent payment is verified as paid, the backend credits the internal balance of the landlord who owns the rented property and records an idempotent rent-credit ledger entry. The backend then submits an idempotent Chapa transfer to the landlord's registered bank account through `POST https://api.chapa.co/v1/transfers`, using Chapa's bearer-authenticated transfer fields (`account_name`, `account_number`, `amount`, `currency`, `reference`, and `bank_code`). It verifies the saved reference through `GET https://api.chapa.co/v1/transfers/verify/{reference}` and requires Chapa to confirm the same reference, amount, currency, and successful status before showing `EXECUTED`. While a live transfer is pending, its amount is reserved from the landlord's internal balance; failed or reverted transfers release that reservation. Sandbox payments use Chapa's transfer test mode (`CHAPA_TRANSFER_TEST_STATUS=success|failed|pending`) and are always shown as `NOT EXECUTED` because no real bank funds move. See [Chapa Transfers](https://developer.chapa.co/transfer/transfers).

Real bank registration and payouts require `PAYMENT_MODE=live`, `PAYMENT_SANDBOX=false`, Chapa's live backend secret key, a valid bank code from Chapa's bank list, an eligible Chapa merchant balance, and server approval enabled in the Chapa Dashboard. Set the backend-only `CHAPA_TRANSFER_APPROVAL_SECRET` to the dashboard approval secret and register `https://<backend-host>/api/chapa/transfer-approval` as the approval URL. Automatic payouts remain pending and are not submitted if the approval secret is missing; an account configured for manual OTP approval cannot complete unattended payouts through this flow. Sandbox requests only simulate provider outcomes, while historical payments without a recorded mode are never treated as live payouts. Secrets must remain on the backend and must never be sent to the frontend.

Landlord bank-account API (all endpoints require authentication):

- `GET /api/bank-accounts/banks` — available bank choices for registration.
- `POST /api/bank-accounts` with `{ "bankCode": "CBE", "accountName": "Dejen", "accountNumber": "100123456789" }` — save/update the authenticated landlord's account.
- `GET /api/bank-accounts/my-account` — return the saved account with a masked account number and internal balance.
- `GET /api/bank-accounts/my-account/transactions` — return the internal credit ledger and balance.

The separate `/api/bank-accounts/demo/*` and `/api/admin/demo-bank-accounts` routes are retained for the legacy internal simulation only; they are not used to register landlord payout details.

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
