import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { User, Mail, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "../../ui/auth/AuthLayout";
import { AuthCard } from "../../ui/auth/AuthCard";
import { AuthInput } from "../../ui/auth/AuthInput";
import { AuthButton } from "../../ui/auth/AuthButton";
import { SocialLogin } from "../../ui/auth/SocialLogin";
import { toast } from "react-hot-toast";
import { isValidEmail, isValidPassword } from "../../util/valid";
import { sendVerificationCode, verifyVerificationCode, registerUser } from "../../service/auth";

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Email Verification
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Step 2: User Details
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const navigate = useNavigate();

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
    // check if email is valid
    if(!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSendingCode(true);

    const result = await sendVerificationCode(email, "register");
    if(result.success) {
      toast.success(result.message);
      setIsSendingCode(false);
      setCooldown(60);
    } else {
      toast.error(result.message);
      setIsSendingCode(false);
      setCooldown(3);
      return;
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.length !== 6) {
       toast.error("Please enter a valid verification code");
       return;
    }

    setIsVerifying(true);
    const result = await verifyVerificationCode(email, verificationCode, "register");
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) {
        toast.error("Please fill in all fields");
        return;
    }

    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.isValid) {
        toast.error(passwordValidation.message || "Invalid password");
        return;
    }

    setIsRegistering(true);
    const result = await registerUser(name, password);
    if(!result.success) {
      toast.error(result.message);
      setIsRegistering(false);
      return;
    }
    setIsRegistering(false);
    toast.success(result.message);
    navigate("/canvas");
  };

  return (
    <AuthLayout>
      <AuthCard
        title={step === 1 ? "Create Account" : "Complete Setup"}
        subtitle={step === 1 ? "Verify your email to get started." : "Choose your username and password."}
        icon={step === 1 ? Mail : User}
      >
        {step === 1 ? (
          /* STEP 1: Email Verification */
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
          /* STEP 2: User Details */
          <form onSubmit={handleRegister} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
             <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3 text-sm text-green-700 mb-6">
                <ShieldCheck className="w-4 h-4" />
                <span>Email verified: {email}</span>
             </div>

            <AuthInput
              label="Name"
              icon={User}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoFocus
            />

            <AuthInput
              label="Password"
              icon={Lock}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
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

            <div className="flex gap-3">
               <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition-colors text-sm"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
               >
                 Back
               </button>
               <AuthButton isLoading={isRegistering} loadingText="Creating account...">
                 Create Account
               </AuthButton>
            </div>
          </form>
        )}

        <SocialLogin />

        <p className="text-center mt-6 text-stone-500 text-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-orange-600 hover:text-orange-700 transition-colors font-medium"
          >
            Sign In
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
