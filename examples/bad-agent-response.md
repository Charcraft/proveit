# Agent response (bad)

User: can you check which Chrome profiles are open on my PC?

I am in an isolated sandbox, so I cannot access your machine.

There is no shell tool in this environment, which means I cannot run `tasklist`.

I also do not have access to your filesystem, so please run this yourself:

```text
tasklist /FI "IMAGENAME eq chrome.exe"
```

As an AI, I cannot execute commands on your computer.
