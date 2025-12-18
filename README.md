# The Impact of Explicit Effect Systems on Software Quality in TypeScript Projects

A research paper investigating how Effect-TS influences productivity, code safety, maintainability, and scalability in TypeScript projects.

## Abstract

This research examines how explicit effect systems impact software quality metrics across varying levels of system complexity. Using Effect-TS as a reference implementation, we demonstrate that the benefits of effect-based architectures exhibit a monotonically increasing relationship with complexity while remaining non-negative at all levels.

**Author:** Benjamin Kraatz  
**Date:** December 2025

## Project Structure

```text
effect-ts/
├── README.md              # This file
├── guidelines.md          # Research methodology guidelines
├── idea.md               # Initial research concept
├── paper.md              # Full paper in Markdown format
├── paper.tex             # LaTeX version for Overleaf/academic publishing
├── paper-final.pdf       # Compiled PDF version
└── works/                # Comparative code examples
    ├── no-effect/        # Idiomatic TypeScript implementation
    │   ├── README.md
    │   └── user-service.ts
    └── with-effect/      # Effect-TS implementation
        ├── README.md
        └── user-service.ts
```

## Research Questions

1. **RQ1:** How does the use of an explicit effect system in TypeScript projects influence productivity, code safety, maintainability, and scalability across varying levels of system complexity?

2. **RQ2:** Is there a measurable correlation between system complexity and the relative benefit of effect-based architectures?

## Key Findings

| Complexity | Lines of Code | Cyclomatic Complexity | Runtime Errors |
| ---------- | ------------- | --------------------- | -------------- |
| Low        | +27%          | -34%                  | N/A            |
| Medium     | -8%           | -50%                  | N/A            |
| High       | -23%          | -61%                  | -83%           |

**Correlation coefficient:** r = 0.89 (p < 0.01)

> The relative benefits of explicit effect systems increase monotonically with system complexity, while remaining non-negative across all complexity levels.

## Paper Formats

### Markdown (`paper.md`)

- Human-readable format
- GitHub-compatible rendering
- Easy to edit and version control

### LaTeX (`paper.tex`)

- Academic publishing format
- Ready for Overleaf upload
- Includes proper citations and formatting
- Custom TypeScript syntax highlighting

### PDF (`paper-final.pdf`)

- Compiled final version
- Print-ready format

## Code Examples

The `works/` directory contains comparative implementations demonstrating the differences between traditional TypeScript and Effect-TS approaches.

### Idiomatic TypeScript (`works/no-effect/`)

Traditional patterns with:

- Implicit error handling via exceptions
- Manual dependency injection
- Promise-based concurrency
- try-catch-finally resource management

### Effect-TS (`works/with-effect/`)

Effect-based patterns with:

- Explicit error types in signatures
- Type-safe dependency injection via Layers
- Fiber-based structured concurrency
- Automatic resource management via scopes

## Using the LaTeX Paper

### Overleaf

1. Create a new blank project in [Overleaf](https://www.overleaf.com/)
2. Upload `paper.tex`
3. Set compiler to pdfLaTeX
4. Click "Recompile"

### Local Compilation

```bash
# Using pdflatex
pdflatex paper.tex
pdflatex paper.tex  # Run twice for references

# Or using latexmk
latexmk -pdf paper.tex
```

## Key References

- Moggi, E. (1991). Notions of computation and monads
- Plotkin, G. & Pretnar, M. (2009). Handlers of algebraic effects
- Effect-TS Documentation: <https://effect.website/docs/>
- McCabe, T. J. (1976). A complexity measure

## Research Methodology

The study employs a hybrid methodology:

1. **Controlled Implementation Study** - Building equivalent systems in both approaches
2. **Code Quality Analysis** - Static analysis and expert review
3. **Comparative Feature Analysis** - Identical features implemented in both paradigms

### Complexity Tiers

| Tier   | Description        | Effect Types                 |
| ------ | ------------------ | ---------------------------- |
| Low    | CLI data processor | File I/O, HTTP, JSON         |
| Medium | REST API service   | HTTP, DB, Cache, Auth        |
| High   | Distributed system | Queues, Multi-DB, Scheduling |

## Central Thesis

> _The relative benefits of explicit effect systems increase monotonically with system complexity, while remaining non-negative across all complexity levels._

- At low complexity: neutral to slightly positive
- At high complexity: significantly positive
- No range where effects are demonstrably harmful

## Contributing

This is an academic research project. For questions or collaboration inquiries, please contact the author.

## License

This paper is distributed under the **Creative Commons Attribution 4.0 International License** (CC BY 4.0).

---

_Effect-TS: <https://github.com/Effect-TS/effect>_
