#!/bin/bash

# PQC-Edge-Attestor Development Container Post-Create Script
set -e

echo "🚀 Setting up PQC-Edge-Attestor development environment..."

# Install Node.js dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

# Install Python dependencies if requirements.txt exists
if [ -f "requirements.txt" ]; then
    echo "🐍 Installing Python dependencies..."
    pip3 install -r requirements.txt
fi

# Create build directory
echo "🏗️ Creating build directories..."
mkdir -p build
mkdir -p build/debug
mkdir -p build/release
mkdir -p build/test

# Setup pre-commit hooks if available
if command -v pre-commit &> /dev/null; then
    echo "🔧 Installing pre-commit hooks..."
    pre-commit install
fi

# Initialize Git hooks
echo "📋 Setting up Git hooks..."
mkdir -p .git/hooks

# Create commit message template
cat > .git/hooks/prepare-commit-msg << 'EOF'
#!/bin/bash
# Automatically add conventional commit format help

if [ "$2" = "" ]; then
    echo "# Conventional Commits Format:" >> "$1"
    echo "# <type>[optional scope]: <description>" >> "$1"
    echo "#" >> "$1"
    echo "# Types: feat, fix, docs, style, refactor, test, chore" >> "$1"
    echo "# Examples:" >> "$1"
    echo "#   feat(crypto): add Kyber-1024 implementation" >> "$1"
    echo "#   fix(attestation): resolve TPM initialization issue" >> "$1"
    echo "#   docs: update API documentation" >> "$1"
    echo "" >> "$1"
fi
EOF

chmod +x .git/hooks/prepare-commit-msg

# Setup CMake configuration
echo "🔨 Configuring CMake..."
if [ ! -f "CMakeLists.txt" ]; then
    cat > CMakeLists.txt << 'EOF'
cmake_minimum_required(VERSION 3.25)
project(PQC-Edge-Attestor VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler flags for security and debugging
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra -Wpedantic -Werror")
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fstack-protector-strong -D_FORTIFY_SOURCE=2")
set(CMAKE_C_FLAGS_DEBUG "${CMAKE_C_FLAGS_DEBUG} -g -O0 -DDEBUG")
set(CMAKE_C_FLAGS_RELEASE "${CMAKE_C_FLAGS_RELEASE} -O3 -DNDEBUG")

# Find dependencies
find_package(PkgConfig REQUIRED)

# Add subdirectories
add_subdirectory(src)
add_subdirectory(tests)

# Enable testing
enable_testing()
EOF
fi

# Create VS Code settings if they don't exist
echo "⚙️ Configuring VS Code settings..."
mkdir -p .vscode

if [ ! -f ".vscode/settings.json" ]; then
    cat > .vscode/settings.json << 'EOF'
{
    "C_Cpp.default.configurationProvider": "ms-vscode.cmake-tools",
    "cmake.buildDirectory": "${workspaceFolder}/build",
    "cmake.generator": "Ninja",
    "cmake.configureOnOpen": true,
    "files.associations": {
        "*.h": "c",
        "*.c": "c"
    },
    "C_Cpp.clang_format_fallbackStyle": "{ BasedOnStyle: LLVM, IndentWidth: 4, ColumnLimit: 100 }",
    "editor.rulers": [100],
    "python.testing.pytestArgs": [
        "tests"
    ],
    "python.testing.unittestEnabled": false,
    "python.testing.pytestEnabled": true
}
EOF
fi

if [ ! -f ".vscode/tasks.json" ]; then
    cat > .vscode/tasks.json << 'EOF'
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Build Debug",
            "type": "shell",
            "command": "cmake",
            "args": ["--build", "build/debug"],
            "group": {
                "kind": "build",
                "isDefault": true
            },
            "problemMatcher": ["$gcc"]
        },
        {
            "label": "Build Release",
            "type": "shell",
            "command": "cmake",
            "args": ["--build", "build/release"],
            "group": "build",
            "problemMatcher": ["$gcc"]
        },
        {
            "label": "Run Tests",
            "type": "shell",
            "command": "ctest",
            "args": ["--test-dir", "build/debug", "--verbose"],
            "group": "test",
            "dependsOn": "Build Debug"
        },
        {
            "label": "Format Code",
            "type": "shell",
            "command": "find",
            "args": ["src", "tests", "-name", "*.c", "-o", "-name", "*.h", "|", "xargs", "clang-format", "-i"],
            "group": "build"
        }
    ]
}
EOF
fi

# Create launch configuration for debugging
if [ ! -f ".vscode/launch.json" ]; then
    cat > .vscode/launch.json << 'EOF'
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Debug Tests",
            "type": "cppdbg",
            "request": "launch",
            "program": "${workspaceFolder}/build/debug/tests/test_runner",
            "args": [],
            "stopAtEntry": false,
            "cwd": "${workspaceFolder}",
            "environment": [],
            "externalConsole": false,
            "MIMode": "gdb",
            "setupCommands": [
                {
                    "description": "Enable pretty-printing for gdb",
                    "text": "-enable-pretty-printing",
                    "ignoreFailures": true
                }
            ],
            "preLaunchTask": "Build Debug"
        }
    ]
}
EOF
fi

# Setup linting configuration
echo "🔍 Setting up linting configuration..."

# EditorConfig
if [ ! -f ".editorconfig" ]; then
    cat > .editorconfig << 'EOF'
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{md,yml,yaml}]
indent_size = 2

[*.json]
indent_size = 2

[Makefile]
indent_style = tab
EOF
fi

# Clang-format configuration
if [ ! -f ".clang-format" ]; then
    cat > .clang-format << 'EOF'
BasedOnStyle: LLVM
IndentWidth: 4
ColumnLimit: 100
PointerAlignment: Right
AlignConsecutiveDeclarations: true
AlignConsecutiveAssignments: true
SpaceBeforeParens: Never
BreakBeforeBraces: Linux
AllowShortFunctionsOnASingleLine: None
SortIncludes: true
IncludeBlocks: Preserve
EOF
fi

# Create .gitignore if it doesn't exist
if [ ! -f ".gitignore" ]; then
    cat > .gitignore << 'EOF'
# Build artifacts
build/
dist/
*.o
*.a
*.so
*.dylib
*.dll
*.exe

# IDE and editor files
.vscode/settings.json
.vscode/.ropeproject
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Logs
*.log
logs/

# Environment files
.env
.env.local

# Test artifacts
test_results/
coverage/
*.gcov
*.gcda
*.gcno

# Documentation build
docs/_build/
site/

# Temporary files
tmp/
temp/
*.tmp

# Hardware-specific
*.bin
*.hex
*.elf
*.map

# Python
__pycache__/
*.py[cod]
*$py.class
.pytest_cache/
.coverage

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Rust
target/
Cargo.lock
EOF
fi

# Create basic Makefile for convenience
if [ ! -f "Makefile" ]; then
    cat > Makefile << 'EOF'
.PHONY: all clean build test format lint install

# Default target
all: build

# Build in debug mode
build:
	@mkdir -p build/debug
	@cd build/debug && cmake -DCMAKE_BUILD_TYPE=Debug -G Ninja ../..
	@cmake --build build/debug

# Build in release mode
release:
	@mkdir -p build/release
	@cd build/release && cmake -DCMAKE_BUILD_TYPE=Release -G Ninja ../..
	@cmake --build build/release

# Run tests
test: build
	@cd build/debug && ctest --verbose

# Format code
format:
	@find src tests -name "*.c" -o -name "*.h" | xargs clang-format -i

# Lint code
lint:
	@cppcheck --enable=all --error-exitcode=1 src/
	@clang-tidy src/*.c src/*/*.c -- -Isrc

# Clean build artifacts
clean:
	@rm -rf build/

# Install dependencies (placeholder)
install:
	@echo "Dependencies should be managed through the devcontainer"

# Help
help:
	@echo "Available targets:"
	@echo "  build     - Build in debug mode"
	@echo "  release   - Build in release mode"
	@echo "  test      - Run tests"
	@echo "  format    - Format source code"
	@echo "  lint      - Run static analysis"
	@echo "  clean     - Clean build artifacts"
	@echo "  install   - Install dependencies"
EOF
fi

# Set permissions
echo "🔐 Setting permissions..."
find . -name "*.sh" -exec chmod +x {} \;

# Create initial documentation structure
echo "📚 Setting up documentation..."
mkdir -p docs/guides docs/api docs/examples

# Setup is complete
echo "✅ Development environment setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Run 'make build' to build the project"
echo "   2. Run 'make test' to run tests"
echo "   3. Use VS Code debugging with F5"
echo "   4. Check 'make help' for available commands"
echo ""
echo "🔧 Tools available:"
echo "   - ARM GCC toolchain for embedded development"
echo "   - OpenOCD for hardware debugging"
echo "   - QEMU for ARM emulation"
echo "   - TPM simulator for testing"
echo "   - Static analysis tools (cppcheck, clang-tidy)"
echo "   - Formatting tools (clang-format)"
echo ""
echo "Happy coding! 🚀"