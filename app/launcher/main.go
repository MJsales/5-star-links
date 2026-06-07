package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
	"unsafe"
)

//go:embed splicer.exe
var splicerBin []byte

func main() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	setConsoleTitle := kernel32.NewProc("SetConsoleTitleW")
	title, _ := syscall.UTF16PtrFromString("5 Star Links - AI Video Splicer")
	setConsoleTitle.Call(uintptr(unsafe.Pointer(title)))

	fmt.Println("")
	fmt.Println("  ╔══════════════════════════════════════════╗")
	fmt.Println("  ║   5 STAR LINKS - AI VIDEO SPLICER v1.0  ║")
	fmt.Println("  ║   Turn YouTube into viral TikToks        ║")
	fmt.Println("  ╚══════════════════════════════════════════╝")
	fmt.Println("")

	name := "5star-splicer-" + strconv.FormatInt(time.Now().UnixNano(), 36) + ".exe"
	splicerPath := filepath.Join(os.TempDir(), name)

	if err := os.WriteFile(splicerPath, splicerBin, 0755); err != nil {
		fmt.Println("  Error extracting splicer:", err)
		return
	}

	cmd := exec.Command(splicerPath)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()

	os.Remove(splicerPath)
}
