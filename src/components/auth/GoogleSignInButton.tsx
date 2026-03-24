interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

const GoogleSignInButton = ({ onSuccess, onError }: GoogleSignInButtonProps) => {
  return (
    <button
      type="button"
      className="flex h-14 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-medium text-slate-500"
      onClick={() => {
        onError("Google sign-in is not supported in the dedicated admin frontend.");
        void onSuccess;
      }}
    >
      Google sign-in is unavailable for admin
    </button>
  );
};

export default GoogleSignInButton;
