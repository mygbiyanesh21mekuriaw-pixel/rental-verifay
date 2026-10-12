import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  LanguageProvider,
  translateText,
  useLanguage,
} from './LanguageContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

const LanguageProbe = () => {
  const { language, setLanguage, t, formatDate, formatCurrency } = useLanguage();

  return (
    <div>
      <span>{language}</span>
      <span>{t('Dashboard')}</span>
      <span>{t('Hello {{name}}', { name: 'Mekdes' })}</span>
      <span>{t('Welcome, ')}</span>
      <span data-testid="formatted-date">{formatDate(new Date('2026-01-02T00:00:00Z'))}</span>
      <span data-testid="formatted-currency">{formatCurrency(100)}</span>
      <span>{t('Verified Properties')}</span>
      <span>{t('Approve')}</span>
      <LanguageSwitcher />
      <button type="button" onClick={() => setLanguage('am')}>
        Change language
      </button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
});

test('defaults to English and persists a selected language', () => {
  render(
    <LanguageProvider>
      <LanguageProbe />
    </LanguageProvider>
  );

  expect(screen.getByText('en')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));

  expect(screen.getByText('am')).toBeInTheDocument();
  expect(screen.getByText('ዳሽቦርድ')).toBeInTheDocument();
  expect(localStorage.getItem('rentalverify-language')).toBe('am');
  expect(screen.getByText('Hello Mekdes')).toBeInTheDocument();
  expect(screen.getByTestId('formatted-date')).not.toBeEmptyDOMElement();
  expect(screen.getByTestId('formatted-currency')).not.toBeEmptyDOMElement();
});

test('initializes using the saved language', () => {
  localStorage.setItem('rentalverify-language', 'am');
  render(
    <LanguageProvider>
      <LanguageProbe />
    </LanguageProvider>
  );

  expect(screen.getByText('am')).toBeInTheDocument();
  expect(screen.getByText('ዳሽቦርድ')).toBeInTheDocument();
});

test('uses English for an unsupported saved language', () => {
  localStorage.setItem('rentalverify-language', 'fr');
  render(
    <LanguageProvider>
      <LanguageProbe />
    </LanguageProvider>
  );
  expect(screen.getByText('en')).toBeInTheDocument();
  expect(screen.getByText('Dashboard')).toBeInTheDocument();
  expect(translateText('Dashboard', 'fr')).toBe('Dashboard');
});

test.each([
  ['om', 'Daashboordii', 'Manneen Mirkanaa\'an', 'Mirkaneessi', 'Akkam Mekdes'],
  ['ti', 'ዳሽቦርድ', 'ዝተረጋገጹ ኣባይቲ', 'ኣጽድቕ', 'ሰላም Mekdes'],
  ['sid', 'Daashboorde', 'Mirkaneessantino Mane', 'Mirkaneessi', 'Keer Mekdes'],
])(
  'switches immediately to %s and persists that language preference',
  (language, dashboard, properties, approve, greeting) => {
    const { unmount } = render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Language / ቋንቋ' }), {
      target: { value: language },
    });

    expect(screen.getByText(language)).toBeInTheDocument();
    expect(screen.getByText(dashboard)).toBeInTheDocument();
    expect(screen.getByText(properties)).toBeInTheDocument();
    expect(screen.getByText(approve)).toBeInTheDocument();
    expect(screen.getByText(greeting)).toBeInTheDocument();
    const welcome = {
      om: 'Baga nagaan dhuftan, ',
      ti: 'ብደሓን ምጻእ፣ ',
      sid: 'Dagoominni wodheenna, ',
    }[language];
    expect(screen.getByText((content, element) =>
      element.tagName === 'SPAN' && element.textContent === welcome
    )).toBeInTheDocument();
    expect(localStorage.getItem('rentalverify-language')).toBe(language);
    expect(document.documentElement).toHaveAttribute('lang', language);

    unmount();
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(screen.getByText(language)).toBeInTheDocument();
    expect(screen.getByText(dashboard)).toBeInTheDocument();
  }
);

test('language selector includes all currently supported languages', () => {
  render(
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>
  );

  const options = screen.getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['English', 'አማርኛ', 'Afaan Oromoo', 'ትግርኛ', 'Sidaamu Afoo']);
});
