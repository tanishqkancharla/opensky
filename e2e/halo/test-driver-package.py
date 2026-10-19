"""Source-only refusal owners; never builds or executes a driver."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PACKAGER=Path(__file__).with_name("package-linux-driver.py").resolve()
def git(folder,*args):
    return subprocess.check_output(["git","-c","user.name=OpenSky fixture","-c","user.email=fixture@example.invalid",*args],cwd=folder,text=True,stderr=subprocess.DEVNULL).strip()

class SourcePreflight(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="opensky-package-source-")
        self.root=Path(self.temp.name)
        driver=self.root/"driver";driver.mkdir()
        git(driver,"init","-q");(driver/"source.txt").write_text("fixture only; no executable")
        git(driver,"add","source.txt");git(driver,"commit","-qm","source fixture")
        self.pin=git(driver,"rev-parse","HEAD")
        (self.root/"driver-source.json").write_text(json.dumps({"verifiedCommit":self.pin}))
        git(self.root,"init","-q");git(self.root,"add","driver-source.json");git(self.root,"commit","-qm","SDK fixture")
        self.head=git(self.root,"rev-parse","HEAD")
    def tearDown(self): self.temp.cleanup()
    def invoke(self,sha=None):
        result=subprocess.run(["python3",str(PACKAGER),"--preflight"],cwd=self.root,env={**os.environ,"GITHUB_SHA":sha or self.head},capture_output=True,text=True,timeout=20)
        self.assertFalse((self.root/"artifacts").exists(),"Source preflight may not package or execute a binary")
        return result
    def test_matching_owned_sources_need_no_binary_or_cargo(self):
        result=self.invoke();self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout),{"sdkCommit":self.head,"driverCommit":self.pin,"sourcePreflight":True,"binaryExecuted":False,"archiveProduced":False})
    def test_different_sdk_commit_refuses_before_build(self):
        self.assertNotEqual(self.invoke("0"*40).returncode,0)
    def test_different_driver_commit_refuses_before_build(self):
        (self.root/"driver-source.json").write_text(json.dumps({"verifiedCommit":"0"*40}))
        self.assertNotEqual(self.invoke().returncode,0)

if __name__=="__main__":unittest.main()
