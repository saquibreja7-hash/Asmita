"""GenD deepfake-detection inference service (Asmita AI Lab, WP112).

Small FastAPI service that wraps the open GenD face-swap/reenactment
detector (Yermakov, Čech, Matas, Fritz, WACV 2026, MIT) with the YuNet
face detector (OpenCV Zoo, MIT). Images are processed in memory only.
"""

__version__ = "0.1.0"
