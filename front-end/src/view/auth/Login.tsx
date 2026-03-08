import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Lock, User, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "../../ui/auth/AuthLayout";
import { AuthCard } from "../../ui/auth/AuthCard";
import { AuthInput } from "../../ui/auth/AuthInput";
import { AuthButton } from "../../ui/auth/AuthButton";
import { SocialLogin } from "../../ui/auth/SocialLogin";
import { loginUser } from "../../service/auth";
import { toast } from "react-hot-toast";
import { queryClient } from "../../query";
import { isValidEmail, isValidPassword } from "../../util/valid";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);


    if(!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      setIsLoading(false);
      return;
    }
    const { isValid, message } = isValidPassword(password);
    if(!isValid) {
      toast.error(message || "Invalid password");
      setIsLoading(false);
      return;
    }

    const result = await loginUser(email, password);
    if(!result.success) {
      toast.error(result.message);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    queryClient.removeQueries({ queryKey: ["user", "profile"] });
    toast.success(result.message);
    navigate("/canvas");
  };

  return (
    <AuthLayout>
      <AuthCard
        title="Welcome Back"
        subtitle="Sign in to your account."
        icon={Lock}
      >
        <form onSubmit={handleLogin} className="space-y-6">
          <AuthInput
            label="Email"
            icon={User}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <AuthInput
            label="Password"
            rightElement={
              <Link
                to="/forgot-password"
                className="text-xs text-stone-400 hover:text-orange-600 transition-colors"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Forgot password?
              </Link>
            }
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

          <AuthButton isLoading={isLoading} loadingText="Signing in...">
            Sign In
          </AuthButton>
        </form>

        <SocialLogin />

        <p className="text-center mt-6 text-stone-500 text-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-orange-600 hover:text-orange-700 transition-colors font-medium"
          >
            Sign Up
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
