import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as authService from '../services/auth.service';

/* ─── Shared Input Component ──────────────────────────────── */
function Field({ label, hint, error, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  'w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors';

/* ─── Section Card ────────────────────────────────────────── */
function Card({ headerIcon, headerLabel, headerRight, children, className = '' }) {
  return (
    <div className={`border border-[#2A313D] bg-[#151922] rounded-[14px] overflow-hidden ${className}`}>
      {(headerLabel || headerRight) && (
        <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
            {headerIcon}
            {headerLabel}
          </span>
          {headerRight}
        </div>
      )}
      <div className="p-6 md:p-7">{children}</div>
    </div>
  );
}

/* ─── Modal Component ─────────────────────────────────────── */
function Modal({ id, title, onClose, children, footer, danger }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E1117]/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] bg-[#151922] border border-[#2A313D] rounded-[14px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[#2A313D]">
          <h2 id={id} className={`text-lg font-semibold ${danger ? 'text-[#F06A7A]' : 'text-[#F5F7FA]'}`}>
            {title}
          </h2>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[#2A313D] bg-[#1B202B]/40 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Spinner ─────────────────────────────────────────────── */
function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Profile Edit ────────────────────────────────────────
  const [name, setName] = useState(user?.name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // ── Change Password ─────────────────────────────────────
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // ── Delete Account ──────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Close password modal ────────────────────────────────
  const closePasswordModal = useCallback(() => {
    if (isChangingPassword) return;
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordMessage('');
    setPasswordErrors({});
  }, [isChangingPassword]);

  // ── Profile Edit Handlers ───────────────────────────────
  const handleSaveName = async () => {
    setNameError('');
    setNameMessage('');

    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }
    if (name.trim().length > 100) {
      setNameError('Name must be 100 characters or less.');
      return;
    }

    setIsSavingName(true);
    try {
      const { user: updatedUser } = await authService.updateProfile({ name: name.trim() });
      await refreshUser();
      setName(updatedUser.name);
      setIsEditingName(false);
      setNameMessage('Name updated successfully.');
      setTimeout(() => setNameMessage(''), 4000);
    } catch (err) {
      setNameError(err.response?.data?.message || 'Failed to update name.');
    } finally {
      setIsSavingName(false);
    }
  };

  // ── Change Password Handlers ────────────────────────────
  const validatePasswordChange = useCallback(() => {
    const errs = {};
    if (!currentPassword) errs.currentPassword = 'Current password is required.';
    if (!newPassword) {
      errs.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errs.newPassword = 'Password must be at least 8 characters long.';
    }
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }
    return errs;
  }, [currentPassword, newPassword, confirmPassword]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    setPasswordErrors({});

    const errs = validatePasswordChange();
    if (Object.keys(errs).length > 0) {
      setPasswordErrors(errs);
      return;
    }

    setIsChangingPassword(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setPasswordMessage('Password changed successfully. Signing you out…');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── Delete Account Handlers ─────────────────────────────
  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (!deletePassword) {
      setDeleteError('Password is required.');
      return;
    }

    setIsDeleting(true);
    try {
      await authService.deleteAccount({ password: deletePassword });
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) return null;

  const createdDate = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="w-full">
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
          ACCOUNT
        </div>
        <h1 className="text-[32px] md:text-[40px] font-extrabold tracking-[-0.03em] leading-[1.04] mb-2 text-[#F5F7FA]">
          PROFILE
        </h1>
        <p className="text-[16px] text-[#A8B0BD] leading-[1.6] max-w-[500px]">
          Manage your personal information and account security.
        </p>
      </div>

      <div className="space-y-6">
        {/* ── Personal Information ──────────────────────── */}
        <Card
          headerIcon={<span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />}
          headerLabel="PERSONAL INFORMATION"
        >
          <div className="space-y-6">
            {/* Name Row */}
            <div>
              <Field label="NAME" error={nameError}>
                {isEditingName ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setIsEditingName(false); setName(user.name); setNameError(''); } }}
                      maxLength={100}
                      className={`${inputBase} flex-1`}
                      autoFocus
                      aria-label="Edit name"
                    />
                    <div className="flex items-center gap-2 sm:flex-shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveName}
                        disabled={isSavingName}
                        className="h-[52px] px-5 rounded-[8px] bg-[#F2B95F] text-[#0E1117] text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#E4A744] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] flex items-center justify-center gap-2 min-w-[100px]"
                      >
                        {isSavingName ? <><Spinner /> Saving…</> : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsEditingName(false); setName(user.name); setNameError(''); }}
                        disabled={isSavingName}
                        className="h-[52px] px-5 rounded-[8px] bg-[#1E242D] border border-[#2A313D] text-[12px] font-semibold tracking-[0.1em] uppercase text-[#A8B0BD] hover:bg-[#2A313D] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 py-3.5 px-4 bg-[#1B202B] border border-[#2A313D] rounded-[8px]">
                    <span className="text-[14px] font-mono text-[#F5F7FA]">{user.name}</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      className="text-[12px] font-semibold tracking-[0.05em] uppercase text-[#F2B95F] hover:text-[#E4A744] transition-colors flex items-center gap-1.5 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1B202B] rounded-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Edit
                    </button>
                  </div>
                )}
              </Field>
              {nameMessage && (
                <div className="mt-2 flex items-center gap-2 text-xs text-[#50CFA6] font-medium">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.54 5.46l-4 5a.75.75 0 01-1.12.02l-2-2a.75.75 0 111.1-1.02l1.43 1.55 3.45-4.32a.75.75 0 111.14.96z" />
                  </svg>
                  {nameMessage}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="border-t border-[#2A313D]" />

            {/* Email Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3.5 px-4 bg-[#1B202B] border border-[#2A313D] rounded-[8px]">
              <div className="min-w-0">
                <span className="block text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-1.5">EMAIL</span>
                <span className="text-[14px] font-mono text-[#F5F7FA] break-all">{user.email}</span>
              </div>
              <span className="inline-flex items-center self-start sm:self-center gap-1.5 px-2.5 py-1 rounded-full bg-[#50CFA6]/10 border border-[#50CFA6]/20 text-[10px] font-mono font-medium tracking-[0.1em] uppercase text-[#50CFA6] flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#50CFA6]" aria-hidden="true" />
                Verified
              </span>
            </div>

            {/* Separator */}
            <div className="border-t border-[#2A313D]" />

            {/* Created Row */}
            <div className="flex items-center justify-between py-3.5 px-4 bg-[#1B202B] border border-[#2A313D] rounded-[8px]">
              <span className="block text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A]">MEMBER SINCE</span>
              <span className="text-[13px] font-mono text-[#A8B0BD]">{createdDate}</span>
            </div>
          </div>
        </Card>

        {/* ── Security ──────────────────────────────────── */}
        <Card
          headerIcon={<span className="w-2 h-2 rounded-full bg-[#50CFA6]" aria-hidden="true" />}
          headerLabel="SECURITY"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3.5 px-4 bg-[#1B202B] border border-[#2A313D] rounded-[8px]">
            <div className="min-w-0">
              <span className="block text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-1.5">PASSWORD</span>
              <span className="text-[13px] text-[#A8B0BD]">
                {user.passwordChangedAt
                  ? `Changed ${new Date(user.passwordChangedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                  : 'Last changed: Unknown'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="h-10 px-5 rounded-[8px] bg-[#1E242D] border border-[#2A313D] text-[12px] font-semibold tracking-[0.1em] uppercase text-[#A8B0BD] hover:bg-[#2A313D] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] flex items-center gap-2 flex-shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Change Password
            </button>
          </div>
        </Card>

        {/* ── Danger Zone ───────────────────────────────── */}
        <Card
          headerIcon={<span className="w-2 h-2 rounded-full bg-[#F06A7A]" aria-hidden="true" />}
          headerLabel="DANGER ZONE"
        >
          <div className="border border-[#F06A7A]/20 rounded-[10px] p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#F5F7FA] mb-1">Delete Account</p>
                <p className="text-[13px] text-[#707A8A] leading-relaxed max-w-[420px]">
                  Permanently delete your account, all links, analytics, and associated data. This action is irreversible.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="h-10 px-5 rounded-[8px] bg-[#F06A7A]/10 border border-[#F06A7A]/30 text-[#F06A7A] text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#F06A7A]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F06A7A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] flex items-center gap-2 flex-shrink-0"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete Account
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Change Password Modal ────────────────────────── */}
      {showPasswordModal && (
        <Modal id="password-modal-title" title="Change Password" onClose={closePasswordModal}
          footer={
            <>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={isChangingPassword}
                className="h-10 px-4 inline-flex items-center justify-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="password-change-form"
                disabled={isChangingPassword}
                className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#E4A744] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                {isChangingPassword ? <><Spinner /> Changing…</> : 'Change Password'}
              </button>
            </>
          }
        >
          <form id="password-change-form" onSubmit={handleChangePassword} noValidate className="space-y-5">
            {passwordError && (
              <div className="p-3 border border-[#F06B7A]/30 bg-[#F06B7A]/10 rounded-[8px] text-sm text-[#F06B7A] flex items-center gap-2" role="alert">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                </svg>
                <span>{passwordError}</span>
              </div>
            )}
            {passwordMessage && (
              <div className="p-3 border border-[#50CFA6]/30 bg-[#50CFA6]/10 rounded-[8px] text-sm text-[#50CFA6] flex items-center gap-2" role="status">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.54 5.46l-4 5a.75.75 0 01-1.12.02l-2-2a.75.75 0 111.1-1.02l1.43 1.55 3.45-4.32a.75.75 0 111.14.96z" />
                </svg>
                <span>{passwordMessage}</span>
              </div>
            )}

            <Field label="CURRENT PASSWORD" hint="REQUIRED" error={passwordErrors.currentPassword}>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={`${inputBase} ${passwordErrors.currentPassword ? 'border-[#F06B7A]' : 'border-[#2A313D]'}`}
                autoComplete="current-password"
                autoFocus
              />
            </Field>

            <Field label="NEW PASSWORD" hint="8+ CHARS" error={passwordErrors.newPassword}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${inputBase} ${passwordErrors.newPassword ? 'border-[#F06B7A]' : 'border-[#2A313D]'}`}
                autoComplete="new-password"
              />
            </Field>

            <Field label="CONFIRM NEW PASSWORD" error={passwordErrors.confirmPassword}>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${inputBase} ${passwordErrors.confirmPassword ? 'border-[#F06B7A]' : 'border-[#2A313D]'}`}
                autoComplete="new-password"
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* ── Delete Account Modal ──────────────────────────── */}
      {showDeleteModal && (
        <Modal id="delete-modal-title" title="Delete Account" danger onClose={() => { if (!isDeleting) { setShowDeleteModal(false); setDeletePassword(''); setDeleteError(''); } }}
          footer={
            <>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteError(''); }}
                disabled={isDeleting}
                className="h-10 px-4 inline-flex items-center justify-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F06A7A] text-white text-[12px] font-bold tracking-[0.1em] uppercase hover:bg-[#E05A6A] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F06A7A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                {isDeleting ? <><Spinner /> Deleting…</> : 'Delete Permanently'}
              </button>
            </>
          }
        >
          <div className="mb-5">
            <div className="w-12 h-12 rounded-full bg-[#F06A7A]/10 border border-[#F06A7A]/20 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[#F06A7A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[14px] text-[#A8B0BD] leading-relaxed mb-4">
              This action permanently deletes your entire account and <strong className="text-[#F5F7FA]">cannot be undone</strong>. The following will be removed:
            </p>
            <ul className="space-y-2 mb-5">
              {['Your account and profile', 'All shortened links', 'All analytics and click data', 'All associated records'].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[13px] text-[#A8B0BD]">
                  <svg className="w-4 h-4 text-[#F06A7A] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <Field label="CONFIRM PASSWORD" hint="REQUIRED" error={deleteError}>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteAccount(); }}
              className={`${inputBase} ${deleteError ? 'border-[#F06B7A]' : 'border-[#2A313D]'}`}
              autoFocus
              autoComplete="current-password"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
