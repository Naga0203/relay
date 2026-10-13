# Contributing to Relay

Thank you for your interest in contributing to **Relay**! We welcome contributions that help improve performance, usability, and security.

---

## 📜 Code of Conduct

Please treat all members of the community with respect and kindness. We are committed to providing a welcoming and harassment-free environment for everyone.

---

## 🛠️ Development Workflow

1. **Fork the Repository**: Create your personal fork on GitHub.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Set Up the Environment**:
   - Ensure Java 21, Maven, Node.js 18+, and MySQL are installed.
   - Copy `.env.example` to `.env` in both `backend` and `frontend`.
4. **Follow Architecture Conventions**:
   - **Zero-Knowledge Principle**: Plaintext message content or private keys must never be logged or sent to the server.
   - **Type Safety**: Maintain strong typing in TypeScript and clean encapsulation in Java.
5. **Run Verification Commands**:
   - Backend tests: `mvn test -f backend/pom.xml`
   - Frontend build: `cd frontend && npm run build`
6. **Commit with Conventional Commits**:
   - Format: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `test: ...`
7. **Submit a Pull Request**:
   - Open a PR against the `main` branch with a clear description of the problem and your solution.

---

## 🔒 Security Vulnerabilities

If you discover a security vulnerability, please **do not** open a public issue. Instead, report it privately to the repository maintainer.
