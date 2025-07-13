"""
Single instance checker for Windows Whisper
Ensures only one instance of the application runs at a time
"""

import os
import sys
import tempfile
import logging

logger = logging.getLogger(__name__)

class SingleInstance:
    """
    Ensures only a single instance of the application is running.
    Uses a lock file approach.
    """
    
    def __init__(self, app_name):
        """Initialize single instance checker"""
        self.app_name = app_name
        self.lockfile = os.path.join(tempfile.gettempdir(), f"{app_name}.lock")
        self.lock_handle = None
        
    def __enter__(self):
        """Enter context manager - check if another instance is running"""
        if sys.platform == 'win32':
            try:
                # Try to create/open the lock file exclusively
                if os.path.exists(self.lockfile):
                    # Try to remove it - if it fails, another instance has it locked
                    try:
                        os.remove(self.lockfile)
                    except:
                        logger.error(f"{self.app_name} is already running")
                        sys.exit(1)
                
                # Create lock file
                self.lock_handle = open(self.lockfile, 'w')
                self.lock_handle.write(str(os.getpid()))
                self.lock_handle.flush()
                logger.debug(f"Lock acquired: {self.lockfile}")
                
            except Exception as e:
                logger.error(f"Failed to acquire lock: {e}")
                sys.exit(1)
        
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager - clean up lock file"""
        if self.lock_handle:
            try:
                self.lock_handle.close()
                if os.path.exists(self.lockfile):
                    os.remove(self.lockfile)
                logger.debug(f"Lock released: {self.lockfile}")
            except Exception as e:
                logger.error(f"Failed to release lock: {e}")
