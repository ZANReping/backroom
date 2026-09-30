#!/usr/bin/env python3
"""Disabled: the Toy Lite build uses procedural music."""
import sys


def main() -> int:
    print("Toy Lite uses procedural music; do not restore MIDI/MP3 assets.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
