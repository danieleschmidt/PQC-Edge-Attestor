# PQC-Edge-Attestor Development Container
FROM mcr.microsoft.com/devcontainers/cpp:1-ubuntu-22.04

# Install system dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        # Build tools
        build-essential \
        cmake \
        ninja-build \
        pkg-config \
        autotools-dev \
        automake \
        libtool \
        # Cross-compilation toolchain for ARM
        gcc-arm-none-eabi \
        gdb-multiarch \
        openocd \
        # Cryptography libraries
        libssl-dev \
        libgmp-dev \
        libmpfr-dev \
        libmpc-dev \
        # Hardware simulation
        qemu-system-arm \
        qemu-user \
        # Analysis tools
        valgrind \
        cppcheck \
        clang-format \
        clang-tidy \
        # Documentation
        doxygen \
        graphviz \
        # Networking tools
        curl \
        wget \
        netcat \
        tcpdump \
        # TPM simulator dependencies
        libtpms-dev \
        swtpm \
        swtpm-tools \
        tpm2-tools \
        libtss2-dev \
        # Python development
        python3-pip \
        python3-venv \
        # Node.js will be installed by devcontainer feature
    && apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install Rust for some PQC implementations and tools
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && echo 'source $HOME/.cargo/env' >> /home/vscode/.bashrc \
    && echo 'source $HOME/.cargo/env' >> /home/vscode/.zshrc

# Install Python packages for testing and analysis
RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install \
        pytest \
        pytest-cov \
        pytest-xdist \
        black \
        pylint \
        mypy \
        cryptography \
        pycryptodome \
        numpy \
        matplotlib \
        jupyter \
        notebook

# Install additional ARM toolchain components
RUN wget -O - https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v12.2.1-1.2/xpack-arm-none-eabi-gcc-12.2.1-1.2-linux-x64.tar.gz | tar -xz -C /opt \
    && ln -s /opt/xpack-arm-none-eabi-gcc-12.2.1-1.2/bin/* /usr/local/bin/

# Install STM32CubeProgrammer for flashing
RUN wget -O stm32cubeprog.zip "https://www.st.com/content/ccc/resource/technical/software/sw_development_suite/group0/00/df/1a/5f/1b/1c/46/e9/stm32cubeprg-lin_v2-14-0/files/stm32cubeprg-lin_v2-14-0.zip/jcr:content/translations/en.stm32cubeprg-lin_v2-14-0.zip" \
    && unzip -q stm32cubeprog.zip -d /tmp \
    && chmod +x /tmp/SetupSTM32CubeProgrammer-2.14.0.linux \
    && /tmp/SetupSTM32CubeProgrammer-2.14.0.linux --mode unattended --prefix /opt/stm32cubeprog \
    && ln -s /opt/stm32cubeprog/bin/STM32_Programmer_CLI /usr/local/bin/ \
    && rm -rf /tmp/* stm32cubeprog.zip

# Setup TPM simulator
RUN mkdir -p /tmp/tpm && cd /tmp/tpm \
    && swtpm socket --tpmstate dir=/tmp/tpm --ctrl type=tcp,port=2321 --server type=tcp,port=2322 --daemon \
    && echo "TPM simulator configured"

# Configure Git for development
RUN git config --system --add safe.directory '*'

# Set up workspace permissions
RUN mkdir -p /workspace && chown -R vscode:vscode /workspace

# Switch to vscode user
USER vscode

# Install user-specific tools
RUN cargo install --locked \
        cbindgen \
        bindgen-cli \
        cargo-audit \
        cargo-deny

# Configure shell
RUN echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc \
    && echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc \
    && echo 'alias ll="ls -la"' >> ~/.bashrc \
    && echo 'alias ll="ls -la"' >> ~/.zshrc

WORKDIR /workspace