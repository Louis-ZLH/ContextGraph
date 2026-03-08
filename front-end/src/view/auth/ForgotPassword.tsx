import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { KeyRound, Mail, ArrowLeft, ShieldCheck, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "react-hot-toast";
import { AuthLayout } from "../../ui/auth/AuthLayout";
import { AuthCard } from "../../ui/auth/AuthCard";
import { AuthInput } from "../../ui/auth/AuthInput";
import { AuthButton } from "../../ui/auth/AuthButton";
import { isValidEmail, isValidPassword } from "../../util/valid";
import { sendVerificationCode, verifyVerificationCode, resetPassword } from "../../service/auth";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const navigate = useNavigate();

  // Step 1: Email Verification
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Step 2: New Password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Handle cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleSendCode = async () => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    if(!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSendingCode(true);
    const result = await sendVerificationCode(email, "reset_password");

    if(result.success) {
      toast.success(result.message);
      setIsSendingCode(false);
      setCooldown(60);
    } else {
      toast.error(result.message);
      setIsSendingCode(false);
      setCooldown(3);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.length !== 6) {
       toast.error("Please enter a valid verification code");
       return;
    }

    setIsVerifying(true);
    const result = await verifyVerificationCode(email, verificationCode, "reset_password");

    if(!result.success) {
      toast.error(result.message);
      setIsVerifying(false);
      return;
    }

    setIsVerifying(false);
    setCooldown(0);
    toast.success(result.message);
    setStep(2);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
        toast.error("Please fill in all fields");
        return;
    }

    if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
    }

    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.isValid) {
        toast.error(passwordValidation.message || "Invalid password");
        return;
    }

    setIsResetting(true);
    const result = await resetPassword(email, password, verificationCode);

    if(!result.success) {
      toast.error(result.message);
      setIsResetting(false);
      return;
    }

    setIsResetting(false);
    toast.success(result.message);
    navigate("/canvas");
  };

  return (
    <AuthLayout>
      <AuthCard
        title="Reset Password"
        subtitle={step === 1 ? "Enter your email to reset your password." : "Set your new password."}
        icon={KeyRound}
      >
        {step === 1 ? (
          /* STEP 1: Email & Code */
          <form onSubmit={handleVerify} className="space-y-6">
             <div className="space-y-4">
               <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <AuthInput
                        label="Email"
                        icon={Mail}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        disabled={cooldown > 0 && cooldown < 61 || isSendingCode}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || cooldown > 0 || !email}
                    className="h-[46px] px-4 mb-px bg-stone-100 border border-stone-200 hover:border-orange-400 text-stone-700 text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                  >
                    {isSendingCode ? "Sending..." : cooldown > 0 ? `${cooldown}s` : "Send Code"}
                  </button>
               </div>

               <AuthInput
                  label="Verification Code"
                  icon={ShieldCheck}
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="######"
                  required
               />
            </div>

            <AuthButton isLoading={isVerifying} loadingText="Verifying...">
              Verify & Continue
            </AuthButton>
          </form>
        ) : (
          /* STEP 2: New Password */
          <form onSubmit={handleResetPassword} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
             <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3 text-sm text-green-700 mb-6">
                <ShieldCheck className="w-4 h-4" />
                <span>Email verified: {email}</span>
             </div>

            <AuthInput
              label="New Password"
              icon={Lock}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus:outline-none flex items-center justify-center p-1"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-stone-400 hover:text-orange-600 transition-colors" />
                  ) : (
                    <Eye className="w-4 h-4 text-stone-400 hover:text-orange-600 transition-colors" />
                  )}
                </button>
              }
            />

            <AuthInput
              label="Confirm Password"
              icon={Lock}
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <div className="flex gap-3">
               <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition-colors text-sm"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
               >
                 Back
               </button>
               <AuthButton isLoading={isResetting} loadingText="Resetting...">
                 Reset Password
               </AuthButton>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-stone-200 flex justify-center">
          <Link
            to="/login"
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition-colors group"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Sign In
          </Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
