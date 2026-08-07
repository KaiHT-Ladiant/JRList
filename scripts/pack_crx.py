#!/usr/bin/env python3
"""
Pack this Chrome extension as CRX3 (+ ZIP).

Usage:
  py -m pip install cryptography
  py scripts/pack_crx.py

Outputs:
  dist/JRList.crx
  dist/JRList.zip
  keys/extension.pem   (created once; keep private)
"""
from __future__ import annotations

import io
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
KEYS = ROOT / "keys"
PEM_PATH = KEYS / "extension.pem"

INCLUDE_DIRS = ("background", "content", "lib", "popup", "icons")
INCLUDE_FILES = ("manifest.json",)


def require_cryptography():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from cryptography.hazmat.backends import default_backend
    except ImportError as exc:
        raise SystemExit(
            "cryptography 패키지가 필요합니다.\n"
            "  py -m pip install cryptography\n"
            f"상세: {exc}"
        )
    return hashes, serialization, padding, rsa, default_backend


def load_or_create_key(serialization, rsa, default_backend):
    KEYS.mkdir(parents=True, exist_ok=True)
    if PEM_PATH.exists():
        key = serialization.load_pem_private_key(
            PEM_PATH.read_bytes(), password=None, backend=default_backend()
        )
        print(f"[*] private key: {PEM_PATH}")
        return key

    key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    PEM_PATH.write_bytes(pem)
    print(f"[+] created private key: {PEM_PATH}")
    print("    (이 파일은 배포하지 마세요. CRX 업데이트 서명에 필요합니다.)")
    return key


def public_key_der(key, serialization):
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def crx_id_from_pub(pub_der: bytes) -> bytes:
    import hashlib

    return hashlib.sha256(pub_der).digest()[:16]


def encode_varint(value: int) -> bytes:
    out = bytearray()
    while True:
        bits = value & 0x7F
        value >>= 7
        out.append(bits | (0x80 if value else 0))
        if not value:
            break
    return bytes(out)


def proto_bytes_field(field_number: int, data: bytes) -> bytes:
    # wire type 2 (length-delimited)
    tag = encode_varint((field_number << 3) | 2)
    return tag + encode_varint(len(data)) + data


def build_signed_header_data(crx_id: bytes) -> bytes:
    # SignedData { optional bytes crx_id = 1; }
    return proto_bytes_field(1, crx_id)


def build_asymmetric_key_proof(public_key: bytes, signature: bytes) -> bytes:
    # AsymmetricKeyProof { public_key = 1; signature = 2; }
    return proto_bytes_field(1, public_key) + proto_bytes_field(2, signature)


def build_crx_file_header(proof: bytes, signed_header_data: bytes) -> bytes:
    # CrxFileHeader {
    #   repeated AsymmetricKeyProof sha256_with_rsa = 2;
    #   optional bytes signed_header_data = 10000;
    # }
    return proto_bytes_field(2, proof) + proto_bytes_field(10000, signed_header_data)


def collect_zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE_FILES:
            path = ROOT / name
            if not path.is_file():
                raise FileNotFoundError(path)
            zf.write(path, arcname=name.replace("\\", "/"))

        for dirname in INCLUDE_DIRS:
            base = ROOT / dirname
            if not base.is_dir():
                continue
            for path in sorted(base.rglob("*")):
                if not path.is_file():
                    continue
                if path.name.startswith("."):
                    continue
                arc = path.relative_to(ROOT).as_posix()
                zf.write(path, arcname=arc)
    return buf.getvalue()


def pack() -> None:
    hashes, serialization, padding, rsa, default_backend = require_cryptography()
    key = load_or_create_key(serialization, rsa, default_backend)
    pub_der = public_key_der(key, serialization)
    crx_id = crx_id_from_pub(pub_der)

    zip_bytes = collect_zip_bytes()
    print(f"[*] zip archive: {len(zip_bytes)} bytes")

    signed_header = build_signed_header_data(crx_id)
    # Signature input per Chromium CRX3:
    #   "CRX3 SignedData\x00" + uint32_le(len(signed_header)) + signed_header + zip
    signed_input = (
        b"CRX3 SignedData\x00"
        + struct.pack("<I", len(signed_header))
        + signed_header
        + zip_bytes
    )
    signature = key.sign(signed_input, padding.PKCS1v15(), hashes.SHA256())

    proof = build_asymmetric_key_proof(pub_der, signature)
    header = build_crx_file_header(proof, signed_header)

    crx = (
        b"Cr24"
        + struct.pack("<I", 3)
        + struct.pack("<I", len(header))
        + header
        + zip_bytes
    )

    DIST.mkdir(parents=True, exist_ok=True)
    crx_path = DIST / "JRList.crx"
    zip_path = DIST / "JRList.zip"
    crx_path.write_bytes(crx)
    zip_path.write_bytes(zip_bytes)

    # human-readable id (mpoce... style): encode first 16 bytes as a-p
    ext_id = "".join(chr(ord("a") + (b >> 4)) + chr(ord("a") + (b & 0x0F)) for b in crx_id)

    print(f"[+] wrote {crx_path} ({crx_path.stat().st_size} bytes)")
    print(f"[+] wrote {zip_path} ({zip_path.stat().st_size} bytes)")
    print(f"[*] extension id: {ext_id}")
    print()
    print("설치 참고:")
    print("  - 로컬 CRX는 Chrome 정책에 따라 드래그 설치가 막힐 수 있습니다.")
    print("  - 가장 안정적: chrome://extensions → 개발자 모드 → 압축해제 로드")
    print("  - Chrome Web Store 항목 추가 시 업로드: dist/JRList.zip (CRX 아님)")
    print("  - 가이드: docs/chrome-web-store.md")


if __name__ == "__main__":
    pack()
