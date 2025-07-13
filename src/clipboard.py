import pyperclip
import logging
import time
import keyboard

logger = logging.getLogger(__name__)

def copy_to_clipboard(text):
    """
    Copy text to system clipboard
    
    Args:
        text (str): Text to copy to clipboard
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        pyperclip.copy(text)
        logger.info(f"Copied {len(text)} characters to clipboard")
        return True
    except Exception as e:
        logger.error(f"Failed to copy to clipboard: {e}")
        return False
        
def get_clipboard_text():
    """
    Get text from system clipboard
    
    Returns:
        str: Text from clipboard or empty string on error
    """
    try:
        text = pyperclip.paste()
        logger.info(f"Read {len(text)} characters from clipboard")
        return text
    except Exception as e:
        logger.error(f"Failed to read from clipboard: {e}")
        return ""

def auto_insert_text(text):
    """
    Automatically insert text into the currently focused field
    
    Args:
        text (str): Text to insert
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Ensure text is already in clipboard
        if not copy_to_clipboard(text):
            return False
            
        # Give time for overlay to close and original window to regain focus
        time.sleep(0.3)
        
        # Use Ctrl+V to paste - more reliable than keyboard.write()
        keyboard.press_and_release('ctrl+v')
        
        # Small delay to ensure paste completes
        time.sleep(0.1)
        
        logger.info(f"Auto-inserted {len(text)} characters using paste")
        return True
    except Exception as e:
        logger.error(f"Failed to auto-insert text: {e}")
        # Fallback: try direct typing method
        try:
            time.sleep(0.2)
            keyboard.write(text)
            logger.info(f"Auto-inserted {len(text)} characters using fallback method")
            return True
        except Exception as e2:
            logger.error(f"Fallback auto-insert also failed: {e2}")
            return False
