#define _GNU_SOURCE
#include <errno.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

static int child(void *unused) { (void)unused; _exit(0); }
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  int flags = CLONE_NEWUSER;
  if (strstr(argv[1], "pid-net")) flags |= CLONE_NEWPID | CLONE_NEWNET;
  int result, saved_errno = 0, status = 0;
  if (strncmp(argv[1], "unshare-", 8) == 0) {
    result = unshare(flags);
    saved_errno = result < 0 ? errno : 0;
  } else if (strncmp(argv[1], "clone-", 6) == 0) {
    size_t size = 1024 * 1024;
    void *stack = malloc(size);
    if (!stack) return 2;
    result = clone(child, (char *)stack + size, flags | SIGCHLD, NULL);
    saved_errno = result < 0 ? errno : 0;
    if (result >= 0) {
      pid_t waited;
      do { waited = waitpid(result, &status, 0); } while (waited < 0 && errno == EINTR);
      if (waited < 0 || !WIFEXITED(status) || WEXITSTATUS(status) != 0) {
        free(stack); return 2;
      }
    }
    free(stack);
  } else return 2;
  printf("{\"operation\":\"%s\",\"created\":%s,\"errno\":%d,\"childReaped\":%s}\n",
         argv[1], result < 0 ? "false" : "true", saved_errno,
         strncmp(argv[1], "clone-", 6) == 0 && result >= 0 ? "true" : "null");
  return result < 0 ? 1 : 0;
}
