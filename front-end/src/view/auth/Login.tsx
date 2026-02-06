import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Lock, User } from "lucide-react";
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
        title="Access Terminal"
        subtitle="Authenticate to access neural interface."
        icon={Lock}
      >
        <form onSubmit={handleLogin} className="space-y-6">
          <AuthInput
            label="Identity / Email"
            icon={User}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@contextcanvas.ai"
            required
          />

          <AuthInput
            label="Passcode"
            rightElement={
              <Link
                to="/forgot-password"
                className="text-xs text-slate-500 hover:text-cyber-neon transition-colors"
              >
                Forgot key?
              </Link>
            }
            icon={Lock}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <AuthButton isLoading={isLoading} loadingText="Authenticating...">
            Establish Connection
          </AuthButton>
        </form>

        <SocialLogin />

        <p className="text-center mt-6 text-slate-500 text-sm">
          New to the system?{" "}
          <Link
            to="/register"
            className="text-cyber-neon hover:text-emerald-300 transition-colors"
          >
            Sign Up
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
