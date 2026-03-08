# Refactor Landing & Auth Pages: Cyber → Paper Style

## Context
The landing page and auth pages are hardcoded with cyber/cyberpunk aesthetics (neon green, dark backgrounds, glassmorphism, perspective grids, monospace fonts, hacker-style copy). The project already has a "paper" theme defined in CSS variables for the canvas workspace, but the landing/auth pages bypass the theme system entirely. The goal is to redesign these pages to match a warm, paper/notebook aesthetic.

## Design Direction: Paper Style
- **Colors**: Cream/beige backgrounds (#fdfbf7), warm stone text (#292524), orange accent (#ea580c)
- **Typography**: Serif fonts (Georgia), no monospace except code blocks
- **Visual Language**: Soft shadows, subtle paper textures, hand-drawn feel, no neon/glow effects
- **Copy**: Warm, friendly language replacing cyber jargon ("Access Terminal" → "Sign In", "Passcode" → "Password", etc.)

## Files to Modify (14 files)

### 1. `src/index.css` — Add paper-specific landing utilities
- Add `.paper-card` class (warm white bg, soft shadow, subtle border)
- Add `.paper-texture` subtle background pattern to replace `perspective-grid`
- Potentially add a warm gradient CSS variable for paper landing

### 2. `src/view/index.tsx` — Landing page wrapper
- Replace `bg-cyber-dark`, `CyberScroller`, cyber gradient bg layers
- Use cream/warm background, serif font, warm scroller
- Remove perspective-grid, replace with subtle paper texture

### 3. `src/ui/landing/LandingHeader.tsx` — Navigation bar
- Replace glass-panel with warm white bg + subtle bottom border
- Replace neon ping dot with simple orange dot
- Replace cyber-neon colors with orange accent
- Replace "Initialize_Canvas >_" with "Get Started →"
- Replace `// Features` style links with normal text

### 4. `src/ui/landing/HeroSection.tsx` — Hero section
- Replace neon gradient text with warm stone/orange colors
- Replace "SYSTEM STATUS: V2.0 CORE ONLINE" badge with something warm
- Replace "DEPLOY CANVAS ENGINE" with "Start Creating"
- Replace "$ READ_MANIFESTO.md" with "Learn More"
- Replace cyber visual (neon orbs, dashed circles) with paper-style illustration (notebook/pen motif)
- Remove all neon shadows and glow effects

### 5. `src/ui/landing/FeaturesSection.tsx` — Feature cards
- Replace glass-panel with paper-card style (white, warm shadow)
- Replace neon hover borders with orange accent borders
- Replace cyber section title format with warm serif heading
- Replace feature names: keep concepts but drop cyber jargon

### 6. `src/ui/landing/EngineSection.tsx` — Models section
- Replace dark terminal display with a warm "card" or "notebook page" display
- Replace glass-panel code window with paper-style bordered card
- Remove terminal window chrome (traffic light dots)
- Use warm code highlighting colors

### 7. `src/ui/landing/Footer.tsx` — Footer
- Replace dark bg with warm cream bg and top border
- Replace cyber-neon icon with orange accent
- Replace "SYSTEM_READY" with normal copy
- Replace "Built for non-linear minds." with warmer tagline

### 8. `src/ui/auth/AuthLayout.tsx` — Auth two-panel layout
- **Left panel**: Replace dark bg + cyber gradient with warm cream/paper background
- Replace neon network visualization with paper-style illustration
- Replace "Neural Knowledge Mapping" with friendly title
- Replace footer "SYS_READY // v2.0.4" with clean copy
- **Right panel**: Replace dark bg with warm white
- Replace "TERMINAL_EXIT [ESC]" link with "← Back to Home"
- Replace "SECURE_CONNECTION: TLS_1.3" with clean footer

### 9. `src/ui/auth/AuthCard.tsx` — Card component
- Replace glass-panel with warm white card, soft shadow
- Replace neon gradient top line with orange accent line
- Replace neon icon bg with warm orange bg
- Use serif font for titles, regular font for subtitles

### 10. `src/ui/auth/AuthInput.tsx` — Input fields
- Replace dark input bg with warm white/cream
- Replace cyber-neon focus colors with orange accent
- Replace monospace labels with serif/sans labels
- Use warm border colors

### 11. `src/ui/auth/AuthButton.tsx` — Button
- Replace cyber-neon bg with orange accent
- Replace neon shadow with warm shadow
- Use warm text colors

### 12. `src/ui/auth/SocialLogin.tsx` — Social buttons
- Replace dark button bg with warm cream borders
- Use warm text and hover colors

### 13. `src/view/auth/Login.tsx` — Login page copy
- "Access Terminal" → "Welcome Back"
- "Authenticate to access neural interface." → "Sign in to your account."
- "Identity / Email" → "Email"
- "Passcode" → "Password"
- "Forgot key?" → "Forgot password?"
- "Establish Connection" → "Sign In"
- "New to the system?" → "Don't have an account?"
- Replace cyber-neon color references with stone/orange

### 14. `src/view/auth/Register.tsx` — Register page copy
- "Initialize Identity" → "Create Account"
- "Verify communication channel." → "Verify your email to get started."
- "Finalize Access" → "Complete Setup"
- "Set your neural identity parameters." → "Choose your username and password."
- "Codename / Name" → "Name"
- "Send Code" button: update styling from cyber to paper
- Replace all cyber color references

### 15. `src/view/auth/ForgotPassword.tsx` — Forgot password copy
- "Recovery Protocol" → "Reset Password"
- "Enter identity to reset access key." → "Enter your email to reset your password."
- "Identity verified" → "Email verified"
- "New Passcode" → "New Password"
- "Confirm Passcode" → "Confirm Password"
- "Reset Access Key" → "Reset Password"
- "Back to Access Terminal" → "Back to Sign In"

## Implementation Order
1. Start with `index.css` (add paper utility classes)
2. Auth UI components (AuthLayout, AuthCard, AuthInput, AuthButton, SocialLogin) — bottom-up, shared components first
3. Auth view pages (Login, Register, ForgotPassword) — copy/text changes
4. Landing UI components (LandingHeader, HeroSection, FeaturesSection, EngineSection, Footer)
5. Landing page wrapper (`view/index.tsx`)

## Verification
- Run `npm run dev` and navigate to `/` — landing page should show paper style
- Navigate to `/login`, `/register`, `/forgot-password` — auth pages should show paper style
- Verify responsive behavior (mobile/desktop) still works
- Verify existing canvas workspace (`/canvas`) is not affected (it uses theme variables)
