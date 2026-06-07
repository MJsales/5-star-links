package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

//go:embed web.exe
var webBin []byte

func main() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	setConsoleTitle := kernel32.NewProc("SetConsoleTitleW")
	setConsoleTitle.Call(uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("5 Star Links - AI Video Splicer"))))

	webPath := filepath.Join(os.TempDir(), "5star-web-v1.exe")
	os.Remove(webPath)

	if err := os.WriteFile(webPath, webBin, 0755); err != nil {
		fmt.Println("Error:", err)
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}

	cmd := exec.Command(webPath, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	os.Remove(webPath)

	if err != nil {
		fmt.Printf("Error: %v\n", err)
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}
}
