"""Generate the public PDF from the canonical HTML guide."""

from pathlib import Path
import os
import shutil

# Homebrew's native text libraries live outside the standard macOS loader path.
homebrew_libs = Path("/opt/homebrew/lib")
if homebrew_libs.exists():
    current_loader_path = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = os.pathsep.join(
        part for part in [str(homebrew_libs), current_loader_path] if part
    )

from weasyprint import CSS, HTML


root = Path(__file__).resolve().parents[1]
html_path = root / "dist" / "guia" / "index.html"
if not html_path.exists():
    raise SystemExit("Run npm run build before npm run guide:pdf")

pdf_path = root / "manual_usuario_app.pdf"
print_styles = CSS(string=".guide-toolbar { display: none !important; }")
HTML(filename=str(html_path)).write_pdf(str(pdf_path), stylesheets=[print_styles])
shutil.copy2(pdf_path, root / "dist" / "manual_usuario_app.pdf")
print(f"Generated {pdf_path} and dist/manual_usuario_app.pdf")
