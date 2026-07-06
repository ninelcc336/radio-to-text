from pathlib import Path

from PyInstaller.building.build_main import Analysis, COLLECT, EXE, PYZ
from PyInstaller.utils.hooks import collect_all


PROJECT_ROOT = Path.cwd()
ENTRY_SCRIPT = PROJECT_ROOT / "engine" / "python" / "main.py"


def safe_collect(package_name: str) -> tuple[list, list, list]:
    try:
        return collect_all(package_name)
    except Exception:
        return ([], [], [])


datas: list = []
binaries: list = []
hiddenimports: list = []

for package in [
    "ctranslate2",
    "faster_whisper",
    "huggingface_hub",
    "imageio_ffmpeg",
    "librosa",
    "llvmlite",
    "numba",
    "numpy",
    "scipy",
    "sklearn",
    "soundfile",
    "tokenizers",
]:
    package_datas, package_binaries, package_hiddenimports = safe_collect(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

a = Analysis(
    [str(ENTRY_SCRIPT)],
    pathex=[str(PROJECT_ROOT / "engine" / "python")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="engine",
)
