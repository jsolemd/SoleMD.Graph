# SoleMD

**Bridging Brain, Mind & Machine**  
_Advancing medicine through shared innovation._

A modern web platform for Dr. Jon Sole, a physician-neuroscientist and systems builder operating at the intersection of clinical medicine, technology, and organizational improvement.

## 🚀 Tech Stack

### Core Framework

- **[Next.js](https://nextjs.org/)** (App Router) - React framework with TypeScript
- **[React 19](https://react.dev/)** - Latest React with concurrent features
- **[TypeScript](https://www.typescriptlang.org/)** - Strict mode enabled

### Styling & UI

- **[Tailwind CSS v4.0.0-alpha.15](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Mantine v8.1.3](https://mantine.dev/)** - React components library
- **[Framer Motion](https://www.framer.com/motion/)** - Animation library
- **[Lucide React](https://lucide.dev/)** - Icon library

### Development & Testing

- **[Jest](https://jestjs.io/)** - Unit testing framework
- **[Playwright](https://playwright.dev/)** - End-to-end testing
- **[ESLint](https://eslint.org/)** - Code linting

## 🎨 Design System

### Brand Colors & Page-Based Theming

- **Home** (`/`): Soft Blue (`#a8c5e9`) - Primary brand
- **About** (`/about`): Soft Lavender (`#d8bee9`) - Synthesizer/Core Narrative
- **Research** (`/research`): Warm Coral (`#ffada4`) - Engagement/Contact
- **Education** (`/education`): Fresh Green (`#aedc93`) - Learning/Teaching
- **Wiki** (`/wiki`): Golden Yellow (`#fbb44e`) - Innovation/Consulting

### Key Features

- **Dynamic Page Coloring**: Navigation and components adapt to current page context
- **Floating Card System**: Consistent hover effects and shadows
- **Responsive Typography**: Fluid scaling with standardized classes
- **Dark/Light Mode**: Full theme support with CSS variables
- **Text Flow Prevention**: Fixes for Tailwind v4 text stacking issues

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd solemd

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Testing
npm run test         # Run Jest unit tests
npm run test:watch   # Run Jest in watch mode
npm run test:visual  # Run Playwright visual tests
npm run test:visual:ui # Run Playwright with UI
```

## 📁 Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── globals.css         # Global styles & theme system
│   ├── layout.tsx          # Root layout component
│   ├── page.tsx            # Home page
│   ├── about/              # About page & components
│   ├── education/          # Education section
│   └── research/           # Research section
├── components/             # Reusable React components
│   ├── ui/                 # UI component library
│   ├── layout/             # Layout components (Header, Footer)
│   └── animations/         # Animation components
├── hooks/                  # Custom React hooks
│   ├── use-mobile.tsx      # Mobile detection
│   ├── use-performance.ts  # Performance monitoring
│   └── use-scroll-performance.ts # Scroll optimization
├── lib/                    # Utility libraries
│   ├── utils.ts            # General utilities
│   ├── mantine-theme.ts    # Mantine theme configuration
│   └── animation-utils.ts  # Animation helpers
└── .kiro/                  # Kiro AI assistant configuration
    └── settings/           # AI settings
```

## 🎯 Key Integration Patterns

### Dynamic Page Coloring

```tsx
const getCurrentPageColor = (pathname: string) => {
  const links = [
    { link: "/", color: "var(--color-soft-blue)" },
    { link: "/about", color: "var(--color-soft-lavender)" },
    { link: "/research", color: "var(--color-warm-coral)" },
    { link: "/education", color: "var(--color-fresh-green)" },
  ];
  const currentLink = links.find((link) => link.link === pathname);
  return currentLink ? currentLink.color : "var(--color-soft-blue)";
};
```

### Floating Card Component

```tsx
<motion.div
  whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
  className="h-full"
>
  <div className="floating-card p-8 h-full relative">
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
      style={{ backgroundColor: getCurrentPageColor(pathname) }}
    >
      <Icon className="h-6 w-6 text-white" />
    </div>
    {/* Content */}
  </div>
</motion.div>
```

### Theme-Safe Animations

```tsx
// ✅ Correct - Uses CSS variables for theme adaptation
const shadowOpacity = useTransform(scrollY, [0, 100], [0, 0.15]);
const boxShadow = useMotionTemplate`0 4px 16px hsl(var(--foreground) / ${shadowOpacity})`;

<motion.div style={{ boxShadow }}>Content</motion.div>;
```

## 🔧 Configuration

### Tailwind CSS v4 Setup

Theme configuration is handled in `app/globals.css` using the new `@theme` directive:

```css
@theme {
  --color-soft-blue: #a8c5e9;
  --color-soft-lavender: #d8bee9;
  /* ... other theme variables */
}
```

### Mantine Integration

Mantine styles are imported before global styles to ensure proper precedence:

```tsx
// app/layout.tsx
import "@mantine/core/styles.css"; // Load first
import "@/app/globals.css"; // Load second (takes precedence)
```

## 🚨 Critical Integration Notes

### Transform Conflicts

When using Framer Motion with Mantine components, prevent transform conflicts:

```tsx
<Button
  styles={{
    root: {
      "&:hover": {
        transform: "none !important", // Let Framer Motion handle transforms
      },
    },
  }}
>
```

### Text Flow Issues

Tailwind v4 with disabled preflight can cause text stacking. Fixed with:

```css
/* Global CSS fix */
h1,
h2,
h3,
h4,
h5,
h6,
p,
div,
span {
  word-break: normal !important;
  overflow-wrap: normal !important;
  white-space: normal !important;
  hyphens: none !important;
}
```

## 🧪 Testing

### Unit Tests (Jest)

```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
```

### Visual Tests (Playwright)

```bash
npm run test:visual       # Run visual regression tests
npm run test:visual:ui    # Run with Playwright UI
npm run test:visual:update # Update snapshots
```

## 🎨 Design Guidelines

### Typography Hierarchy

- **Hero Title**: `text-hero-title` - Fluid scaling from 2.25rem to 6rem
- **Hero Subtitle**: `text-hero-subtitle` - 1.125rem → 1.5rem
- **Section Title**: `text-section-title` - 1.875rem → 2.25rem
- **Card Title**: `text-card-title` - 1.25rem
- **Body Text**: `text-body-large` / `text-body-small`

### Container Patterns

```tsx
// Hero sections
<div className="hero-container">

// Content sections
<div className="content-container">

// Centered content
<div className="centered-content-container">
```

### Animation Standards

```tsx
// Card hover (gentle lift)
whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}

// Button hover (subtle scale + lift)
whileHover={{ scale: 1.02, y: -1, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
```

## 🤖 AI Assistant Integration

This project includes Kiro AI assistant configuration in `.kiro/`:

- **Specs**: Feature specifications and implementation plans
- **Steering**: AI guidance rules and integration patterns
- **Hooks**: Automated workflows and triggers

## 🔗 Key Dependencies

### Production

- `@mantine/core` `@mantine/hooks` - UI components and utilities
- `framer-motion` - Animations and gestures
- `lucide-react` - Icon library
- `next-themes` - Theme switching
- `react-intersection-observer` - Scroll animations

### Development

- `@playwright/test` - E2E testing
- `jest` `@testing-library/react` - Unit testing
- `typescript` - Type checking
- `eslint` - Code linting

## 📄 License

Private project for Dr. Jon Sole's professional website.

## 🤝 Contributing

This is a private project. For development questions or contributions, please contact the project maintainer.

---

**SoleMD** - Bridging the gap between clinical expertise and technological innovation.
