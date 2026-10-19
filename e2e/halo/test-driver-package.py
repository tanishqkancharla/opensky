"""Source-only refusal owners; never builds or executes a driver."""
import io
import json
import tarfile
from driver_archive import extract_archive
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

class ArchiveExtraction(unittest.TestCase):
    def test_regular_binary_bytes_and_mode_survive(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);archive=folder/'binary.tgz'
            with tarfile.open(archive,'w:gz') as tar:
                m=tarfile.TarInfo('owned/opensky-driver');m.size=3;m.mode=0o755;tar.addfile(m,io.BytesIO(b'elf'))
            extract_archive(archive,folder/'out','owned')
            self.assertEqual((folder/'out/owned/opensky-driver').read_bytes(),b'elf')
            self.assertEqual((folder/'out/owned/opensky-driver').stat().st_mode & 0o777,0o755)
    def test_nonordinary_members_refuse_before_writing(self):
        for name,kind in [('owned/../escape',tarfile.REGTYPE),('outside/file',tarfile.REGTYPE),('/owned/file',tarfile.REGTYPE),('owned/link',tarfile.SYMTYPE),('owned/hardlink',tarfile.LNKTYPE),('owned/device',tarfile.CHRTYPE),('owned/duplicate',tarfile.REGTYPE)]:
            with self.subTest(name=name,kind=kind),tempfile.TemporaryDirectory() as tmp:
                folder=Path(tmp);archive=folder/'bad.tgz'
                with tarfile.open(archive,'w:gz') as tar:
                    good=tarfile.TarInfo('owned/good');good.size=1;tar.addfile(good,io.BytesIO(b'x'))
                    bad=tarfile.TarInfo(name);bad.type=kind;tar.addfile(bad)
                    if 'duplicate' in name:tar.addfile(bad)
                with self.assertRaises(ValueError):extract_archive(archive,folder/'out','owned')
                self.assertFalse((folder/'out').exists())

if __name__=="__main__":unittest.main()
