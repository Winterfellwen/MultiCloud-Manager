.PHONY: build build-web dev test clean

# Go build
build:
	go build -o bin/multicloud main.go

# Frontend build (merge into single file for deployment)
build-web:
	@echo "Building web assets..."
	@mkdir -p web/dist
	@cat web/css/variables.css web/css/base.css web/css/layout.css web/css/components.css > web/dist/style.css
	@echo "Web assets built to web/dist/"

# Development mode (reference source files directly)
dev:
	go run main.go

# Test
test:
	go test ./... -v

# Clean
clean:
	rm -rf bin/ web/dist/
