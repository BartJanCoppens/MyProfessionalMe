// @vitest-environment jsdom
// Sign-in and the forced password change after a temporary password (FT-AUTH-*). Supabase is a fake.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { ChangePasswordScreen, SignInScreen } from './SignIn';


beforeEach(() => db.reset());
afterEach(cleanup);

const type = (input: Element, value: string) => fireEvent.change(input, { target: { value } });
const passwords = (c: HTMLElement) => Array.from(c.querySelectorAll('input[type=password]'));
const submit = async () => { await act(async () => { fireEvent.submit(document.querySelector('form')!); }); };

describe('signing in', () => {
  it('signs in with the trimmed email and the password', async () => {
    const { container } = render(<SignInScreen />);
    type(container.querySelector('input[type=email]')!, '  robin.test@example.com ');
    type(passwords(container)[0], 'Secret12345!');
    await submit();
    expect(db.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'robin.test@example.com', password: 'Secret12345!' });
    expect(screen.queryByText(/do not match/)).toBeNull();
  });
  it('explains wrong credentials in plain words', async () => {
    db.client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    render(<SignInScreen />);
    await submit();
    expect(screen.getByText('That email and password do not match an account.')).toBeTruthy();
  });
  it('passes other errors through and is not busy afterwards', async () => {
    db.client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Email not confirmed' } });
    render(<SignInScreen />);
    await submit();
    expect(screen.getByText('Email not confirmed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
  it('shows that it is busy while signing in', async () => {
    let done: (v: { error: null }) => void = () => {};
    db.client.auth.signInWithPassword.mockImplementationOnce(() => new Promise((r) => { done = r; }));
    render(<SignInScreen />);
    await submit();
    expect((screen.getByRole('button', { name: 'Signing in' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { done({ error: null }); });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('replacing a temporary password', () => {
  const setup = () => {
    const onDone = vi.fn(async () => {}), onSignOut = vi.fn();
    const { container } = render(<ChangePasswordScreen email="robin.test@example.com" onDone={onDone} onSignOut={onSignOut} />);
    const [pw, again] = passwords(container);
    return { onDone, onSignOut, pw, again };
  };
  it('refuses a password that breaks the rule', async () => {
    const { pw, again } = setup();
    type(pw, 'short'); type(again, 'short');
    await submit();
    expect(screen.getAllByText('At least 12 characters, with lower-case and upper-case letters and a digit.')).toHaveLength(2);
    expect(db.client.functions.invoke).not.toHaveBeenCalled();
  });
  it('refuses two passwords that differ', async () => {
    const { pw, again } = setup();
    type(pw, 'Abcdefghijk1'); type(again, 'Abcdefghijk2');
    await submit();
    expect(screen.getByText('The two passwords do not match.')).toBeTruthy();
  });
  it('saves the password, signs in again and continues', async () => {
    const { pw, again, onDone } = setup();
    type(pw, 'Abcdefghijk1'); type(again, 'Abcdefghijk1');
    await submit();
    expect(db.client.functions.invoke).toHaveBeenCalledWith('manage-users', { body: { action: 'change_password', password: 'Abcdefghijk1' } });
    expect(db.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'robin.test@example.com', password: 'Abcdefghijk1' });
    expect(onDone).toHaveBeenCalled();
  });
  it('says so when signing in again fails after saving', async () => {
    db.client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'rate limited' } });
    const { pw, again, onDone } = setup();
    type(pw, 'Abcdefghijk1'); type(again, 'Abcdefghijk1');
    await submit();
    expect(screen.getByText('Password saved, but signing in again failed: rate limited')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
  it('shows a refusal from the server', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Password is known to be weak' } });
    const { pw, again } = setup();
    type(pw, 'Abcdefghijk1'); type(again, 'Abcdefghijk1');
    await submit();
    expect(screen.getByText('Password is known to be weak')).toBeTruthy();
  });
  it('signs out instead', () => {
    const { onSignOut } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
