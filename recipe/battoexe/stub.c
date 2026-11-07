#include <stdio.h>
#include <string.h>
#include <windows.h>

// the handler appends: [script][u32le script size][magic]
#define MAGIC "CONVERT"

int main() {
  char exe[MAX_PATH], bat[MAX_PATH], cmd[MAX_PATH + 32], magic[8];
  unsigned int size;
  GetModuleFileNameA(NULL, exe, MAX_PATH);
  FILE *f = fopen(exe, "rb");
  fseek(f, -12, SEEK_END);
  fread(&size, 4, 1, f);
  fread(magic, 8, 1, f);
  if (memcmp(magic, MAGIC, 8) != 0) {
    fputs("battoexe: no script attached\n", stderr);
    return 1;
  }

  // copy the script into a temp .bat
  char *script = malloc(size);
  fseek(f, -12 - (long)size, SEEK_END);
  fread(script, 1, size, f);
  fclose(f);
  GetTempPathA(MAX_PATH, bat);
  sprintf(bat + strlen(bat), "battoexe-%lu.bat", GetCurrentProcessId());
  f = fopen(bat, "wb");
  fwrite(script, 1, size, f);
  fclose(f);

  // /s strips the outer quotes, so the path can have spaces and such
  sprintf(cmd, "cmd /d /s /c \"\"%s\"\"", bat);
  STARTUPINFOA si = {sizeof(si)};
  PROCESS_INFORMATION pi;
  DWORD code = 1;
  if (CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &code);
  }
  DeleteFileA(bat);
  return code;
}
