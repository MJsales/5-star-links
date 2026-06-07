package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

//go:embed web.exe
var webBin []byte

func main() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	freeConsole := kernel32.NewProc("FreeConsole")
	freeConsole.Call()

	name := "5star-web-" + strconv.FormatInt(time.Now().UnixNano(), 36) + ".exe"
	webPath := filepath.Join(os.TempDir(), name)
	os.Remove(webPath)

	if err := os.WriteFile(webPath, webBin, 0755); err != nil {
		return
	}

	cmd := exec.Command(webPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return
	}

	cmd.Wait()
	os.Remove(webPath)
}
