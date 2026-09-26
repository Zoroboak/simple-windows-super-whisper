import base64, hashlib, json, lzma, pathlib, shutil
root = pathlib.Path.cwd().resolve()
folder = root / '.delivery'
manifest = json.loads((folder / 'manifest.json').read_text())
parts = []
for name, expected in sorted(manifest['parts'].items()):
    data = (folder / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, 'Chunk mismatch: ' + name
    parts.append(data)
compressed = base64.b64decode(b''.join(parts), validate=True)
assert hashlib.sha256(compressed).hexdigest() == manifest['sha256'], 'Payload checksum mismatch'
entries = json.loads(lzma.decompress(compressed))
outputs = {}
for name, entry in entries.items():
    target = (root / name).resolve()
    assert target.is_relative_to(root) and name.split('/')[0] not in ['.git', '.github', '.delivery'], 'Unsafe path'
    if 'text' in entry:
        data = entry['text'].encode('utf-8')
    elif 'b64' in entry:
        data = base64.b64decode(entry['b64'], validate=True)
    else:
        original = target.read_bytes()
        assert hashlib.sha256(original).hexdigest() == entry['base'], 'Wrong baseline: ' + name
        lines = original.decode('utf-8').splitlines(keepends=True)
        data = ''.join(''.join(lines[op[0]:op[1]]) if isinstance(op, list) else op for op in entry['ops']).encode('utf-8')
    assert hashlib.sha256(data).hexdigest() == entry['sha'], 'Output mismatch: ' + name
    outputs[target] = data
for target, data in outputs.items():
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
(root / 'scripts/setup-kde-wayland.sh').chmod(0o755)
print('Verified and applied', len(outputs), 'source files')
shutil.rmtree(folder)
