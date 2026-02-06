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
        title={step === 1 ? "Initialize Identity" : "Finalize Access"}
        subtitle={step === 1 ? "Verify communication channel." : "Set your neural identity parameters."}
        icon={step === 1 ? Mail : User}
      >
        {step === 1 ? (
          /* STEP 1: Email Verification */
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-4">
               <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <AuthInput
                        label="Identity / Email"
                        icon={Mail}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="neo@matrix.io"
                        required
                        disabled={cooldown > 0 && cooldown < 61 || isSendingCode} // Keep enabled to allow correction, but generally handling via button logic
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || cooldown > 0 || !email}
                    className="h-[46px] px-4 mb-px bg-slate-800 border border-white/10 hover:border-cyber-neon/50 text-cyber-neon text-xs font-mono rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
             <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-3 text-sm text-emerald-400 mb-6">
                <ShieldCheck className="w-4 h-4" />
                <span>Email verified: {email}</span>
             </div>

            <AuthInput
              label="Codename / Name"
              icon={User}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Neo"
              required
              autoFocus
            />

            <AuthInput
              label="Passcode"
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
                    <EyeOff className="w-4 h-4 text-slate-500 hover:text-cyber-neon transition-colors" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-500 hover:text-cyber-neon transition-colors" />
                  )}
                </button>
              }
            />

            <div className="flex gap-3">
               <button 
                type="button" 
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors font-mono text-sm"
               >
                 Back
               </button>
               <AuthButton isLoading={isRegistering} loadingText="Initializing...">
                 Create Access
               </AuthButton>
            </div>
          </form>
        )}

        <SocialLogin />

        <p className="text-center mt-6 text-slate-500 text-sm">
          Already have access?{" "}
          <Link
            to="/login"
            className="text-cyber-neon hover:text-emerald-300 transition-colors"
          >
            Login
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
