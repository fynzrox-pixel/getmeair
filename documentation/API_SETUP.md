# Telegram API credentials for Getmeair

Getmeair uses the official Telegram API (MTProto). To **build the application from source**, you must provide your own `api_id` and `api_hash`. Do not use test, invented, or published credentials for a release build.

The supplied prebuilt `build\Getmeair.exe` was compiled elsewhere and already contains the credentials from its original build. The steps below are required only when rebuilding from the modified source in this repository.

## Obtain credentials

1. Sign in at <https://my.telegram.org>.
2. Open **API Development tools**.
3. Create an application (for example, title `Getmeair`, short name `getmeair`, platform `Desktop`).
4. Copy the generated `api_id` and `api_hash`.

## Configure the project

1. Copy `config\api.env.example` to `config\api.env`.
2. Fill in your values:

```dotenv
API_ID=123456
API_HASH=0123456789abcdef0123456789abcdef
```

3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\config\apply_api.ps1
```

The script validates that:

- `API_ID` is a positive decimal integer;
- `API_HASH` is a 32-character hexadecimal string;
- the placeholder value from `api.env.example` is not accepted.

It writes:

```
source\Telegram\SourceFiles\core\api_credentials.generated.h
```

The generated header and `config\api.env` are ignored by Git. The script never prints the secret values.

## Alternative: CMake defines

You can pass credentials directly to CMake:

```bat
cmake -S source -B build\out -G Ninja ^
  -DTDESKTOP_API_ID=123456 ^
  -DTDESKTOP_API_HASH=0123456789abcdef0123456789abcdef
```

For CI, prefer environment variables or secret storage instead of committing `api.env`.

## Security rules

- Never commit `api.env`, `api_credentials.generated.h`, or any real `API_HASH`.
- Never include credentials in logs, screenshots, archives, or issue reports.
- If credentials are exposed, revoke them at <https://my.telegram.org/apps> and create new ones.
- Use only the official Telegram API; do not bypass server-side limits or restrictions.

## Ukrainian / Russian note

Отримайте `api_id` та `api_hash` на <https://my.telegram.org/apps>, скопіюйте `config/api.env.example` у `config/api.env`, заповніть значення та виконайте `config/apply_api.ps1`. Не публікуйте `API_HASH` у GitHub чи логах.
