"""Verify the approved first-party archive without executing its binary."""
import hashlib
import json
import re
from pathlib import Path
import sys

root=Path.cwd();folder=Path(sys.argv[1]);pin=json.loads((root/'.github/linux-driver-release-archive.json').read_text())
selected=json.loads((root/'driver-source.json').read_text())['verifiedCommit']
assert selected==pin['sourceCommit']
meta=json.loads((folder/'driver-release/archive.json').read_text())
for key in ('file','sha256','binarySHA256','directory','sourceCommit','version'):assert meta[key]==pin[key]
for relative,expected in [("driver-release/"+pin['file'],pin['sha256']),('driver-release/provenance.json',pin['provenanceSHA256']),('halo/platform-linux-unit.log',pin['unitLogSHA256'])]:
    assert hashlib.sha256((folder/relative).read_bytes()).hexdigest()==expected
provenance=json.loads((folder/'driver-release/provenance.json').read_text())
assert provenance['sdkCommit']==pin['buildSDKCommit'] and provenance['sourceCommit']==selected
assert provenance['binarySHA256']==pin['binarySHA256']
identity=provenance['identity']
assert identity['source']==selected and identity['product']=='opensky-driver' and identity['protocolVersion']==1
expected_count = pin.get('unitTestsPassed', 669)
assert type(expected_count) is int and expected_count >= 669
results = re.findall(r'test result: ok\. (\d+) passed; 0 failed;', (folder/'halo/platform-linux-unit.log').read_text())
assert results == [str(expected_count)], 'Linux unit count must match the approved archive build'
print(json.dumps({'archiveSHA256':pin['sha256'],'binarySHA256':pin['binarySHA256'],'originalBuildSDK':pin['buildSDKCommit'],'originalRun':pin['sourceRun'],'sourceCommit':selected,'freshBuild':False,'desktopAccepted':False,'binaryExecuted':False}))
