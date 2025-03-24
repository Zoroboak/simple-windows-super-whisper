import pyperclip
import logging

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