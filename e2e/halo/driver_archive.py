"""Safe regular-file extraction on Bookworm Python3.11.2 and newer."""
from pathlib import Path, PurePosixPath
import shutil
import tarfile


def extract_archive(archive, destination, root):
    destination=Path(destination)
    if not root or '/' in root or '\\' in root or root in ('.','..'):
        raise ValueError('Archive root must be one ordinary directory name')
    if destination.is_symlink() or (destination.exists() and any(destination.iterdir())):
        raise ValueError('Archive destination must be an empty owned directory')
    with tarfile.open(archive) as tar:
        members=tar.getmembers();seen=set()
        for m in members:
            path=PurePosixPath(m.name)
            if ('\\' in m.name or path.is_absolute() or any(p in ('.','..') for p in m.name.split('/'))
                    or path.parts[0]!=root or (len(path.parts)==1 and not m.isdir())
                    or not (m.isdir() or m.isfile()) or str(path) in seen):
                raise ValueError('Archive contains a duplicate or non-ordinary member')
            seen.add(str(path))
        # Validate every member before writing anything. Never invoke tarfile's
        # legacy unfiltered extractor or follow a member link/device.
        destination.mkdir(parents=True,exist_ok=True)
        for m in members:
            target=destination.joinpath(*PurePosixPath(m.name).parts)
            if m.isdir():target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with tar.extractfile(m) as source, target.open('xb') as output:
                    shutil.copyfileobj(source,output)
                target.chmod(m.mode & 0o777)
