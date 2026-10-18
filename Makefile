# Docker shortcuts for the ProFolder web app. Run `make` or `make help` for the list.
#   make up MUSIC_DIR=/Volumes/Studio/Projects APP_PORT=8080

MUSIC_DIR ?= $(HOME)/Music
APP_PORT  ?= 5175
export MUSIC_DIR APP_PORT

COMPOSE := docker compose

.DEFAULT_GOAL := help
.PHONY: help build up down restart logs ps shell open rebuild

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
	@echo "\n  MUSIC_DIR=$(MUSIC_DIR)  APP_PORT=$(APP_PORT)"

build: ## Build the Docker image
	$(COMPOSE) build

up: ## Start the service in the background (builds the image if missing)
	$(COMPOSE) up -d
	@echo "ProFolder running at http://localhost:$(APP_PORT) (music: $(MUSIC_DIR))"

down: ## Stop and remove the container (the DB volume is kept)
	$(COMPOSE) down

restart: ## Restart the running container
	$(COMPOSE) restart

rebuild: ## Rebuild the image and restart the service with it
	$(COMPOSE) up -d --build

logs: ## Follow the service logs
	$(COMPOSE) logs -f

ps: ## Show container status and health
	$(COMPOSE) ps

shell: ## Open a shell inside the running container
	$(COMPOSE) exec profolder sh

open: ## Open the app in the browser (macOS)
	open http://localhost:$(APP_PORT)
