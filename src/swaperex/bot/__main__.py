"""Entry point for running bot as module: python -m swaperex.bot"""

# Load .env file before importing anything else
from dotenv import load_dotenv
load_dotenv()

from swaperex.bot.bot import main

if __name__ == "__main__":
    main()
