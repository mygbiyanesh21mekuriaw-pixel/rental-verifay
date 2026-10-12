import React from 'react';
import { Link } from 'react-router-dom';

const MaintenancePage = ({ message, onLogout }) => (
  <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
    <div className="w-full rounded-2xl border border-amber-200 bg-white p-8 shadow-lg">
      <h1 className="text-3xl font-bold text-slate-900">Under maintenance</h1>
      <p className="mt-4 text-lg text-slate-700">{message}</p>
      <p className="mt-3 text-sm text-slate-500">Please check back later.</p>
      <Link
        to="/login"
        className="mt-6 inline-flex rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
      >
        Platform Admin sign in
      </Link>
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 inline-flex rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign out to use another account
        </button>
      )}
    </div>
  </main>
);

export default MaintenancePage;
