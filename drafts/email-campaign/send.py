#!/usr/bin/env python3
"""
Рассылка Charter Capital по сегментированной базе (Яндекс 360, SMTP).

Использование:
  export SMTP_USER="hello@ccapital.pro"
  export SMTP_PASS="<пароль приложения Яндекс>"
  python3 send.py --segment A_ved --dry-run          # посмотреть, что уйдёт
  python3 send.py --segment B_private --limit 30      # отправить батч (30 шт)

Скрипт сам ведёт журнал sent.csv и не отправляет письмо дважды.
Темп: случайная пауза 45–90 сек между письмами (антиспам-профиль).
"""
import argparse, csv, os, random, smtplib, ssl, sys, time
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

BASE = Path(__file__).parent
CONTACTS = BASE / "contacts.csv"
SENT_LOG = BASE / "sent.csv"
UNSUB = BASE / "unsubscribed.txt"   # по одному email в строке

FROM_NAME = "Charter Capital"

SUBJECTS = {
    "A_ved": "Платежи за импорт, когда SWIFT не проходит — легальный маршрут",
    "B_private": "Деньги из РФ для западного банка — мусор? Не обязательно",
}

HOOK_IMG = "https://ccapital.pro/assets/home/ql-villa-band-800w.jpg"

TPL_A = """{greet}

Пишем коротко и по делу. Мы — Charter Capital, помогаем компаниям-импортёрам проводить платежи за границу, когда классические каналы не работают: банк заворачивает SWIFT, посредники дорожают, Китай и ОАЭ ужесточают приём.

Что делаем:
— B2B-платежи через USDC из регулируемого западного контура, без «серых» посредников:
  https://ccapital.pro/pay.html?utm_source=email&utm_campaign=ved
— платёжное досье под комплаенс банка-получателя (Source of Funds для юрлица);
— консультация по маршруту ВЭД под конкретную страну и контракт:
  https://ccapital.pro/ved-consulting.html?utm_source=email&utm_campaign=ved

Работаем только с подтверждённым законным происхождением средств — поэтому наши платежи доходят.

Если тема актуальна — просто ответьте на это письмо или напишите в Telegram: @ccapital_acces.
Полезное для ВЭД: наш дайджест о банках, санкциях и платежах — https://t.me/ccapital26

Charter Capital · https://ccapital.pro
Если не актуально — ответьте «не надо», больше не побеспокоим.
"""

TPL_B = """{greet}

«Для западного банка деньги без понятной биографии — мусор». Звучит жёстко, но именно так сегодня работает комплаенс: банк спрашивает не «сколько у вас денег», а «откуда они и чьи». Капитал без документальной «биографии» не принимают — каким бы честным он ни был.

Мы — Charter Capital. Помогаем владельцам капитала из России и СНГ легально работать с внешним миром: собираем ту самую «биографию» денег и открываем двери, которые без неё закрыты.

Что мы строим:
— досье происхождения средств (Source of Funds / Source of Wealth) под западный комплаенс:
  https://ccapital.pro/source-of-funds.html?utm_source=email&utm_campaign=private
— ВНЖ и вторая резиденция для семьи: Мальта (фикс-налог €15 000/год), ОАЭ, Азия:
  https://ccapital.pro/residence.html?utm_source=email&utm_campaign=private
— готовый бизнес в Европе — реальное дело с денежным потоком и путь к ВНЖ:
  https://ccapital.pro/business-eu.html?utm_source=email&utm_campaign=private
— недвижимость (Пхукет, Европа) и зарубежные счета.

С чего начать:
1) Telegram-дайджест — коротко о санкциях, банках и юрисдикциях, без воды: https://t.me/ccapital26
2) Бесплатная диагностика капитала — 3 вопроса за 60 секунд: https://ccapital.pro/diagnostic.html?utm_source=email&utm_campaign=private
3) Или ответьте на письмо — разберём вашу ситуацию под NDA (30 минут).

Важно: мы не работаем с лицами под санкциями и работаем только с капиталом подтверждённого законного происхождения.

Charter Capital · https://ccapital.pro · Telegram @ccapital_acces
Не хотите таких писем — ответьте «отписаться», и мы больше не потревожим.
"""

HTML_B = """\
<!DOCTYPE html>
<html lang="ru"><body style="margin:0;padding:0;background:#f4f2ee;">
<div style="max-width:600px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;color:#1a1f2e;">
  <div style="padding:22px 26px 0;background:#ffffff;">
    <p style="margin:0 0 14px;font-size:16px;">{greet}</p>
  </div>
  <img src="{img}" alt="Капитал без биографии: визит, которого никто не ждал" width="600"
       style="display:block;width:100%;height:auto;background:#0a0e1a;">
  <div style="background:#0a0e1a;color:#f2ede3;padding:20px 26px 24px;">
    <p style="margin:0;font-size:21px;line-height:1.35;font-weight:bold;">
      «Для западного банка деньги без понятной биографии&nbsp;— мусор»
    </p>
    <p style="margin:10px 0 0;font-size:14px;color:#c9a86a;">
      Счета, виллы и яхты не защищают сами себя. Защищает документальная биография капитала — и её можно собрать.
    </p>
  </div>
  <div style="background:#ffffff;padding:22px 26px 8px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px;">Сегодня банк спрашивает не «сколько у вас денег», а «откуда они и чьи».
    Капитал без документальной «биографии» не принимают — каким бы честным он ни был.</p>
    <p style="margin:0 0 8px;">Мы — <b>Charter Capital</b>. Помогаем владельцам капитала из России и СНГ
    легально работать с внешним миром:</p>
    <ul style="margin:0 0 14px;padding-left:20px;">
      <li style="margin-bottom:6px;"><a href="https://ccapital.pro/source-of-funds.html?utm_source=email&amp;utm_campaign=private" style="color:#8a6d3b;">Досье происхождения средств</a> (Source of Funds / Source of Wealth) под западный комплаенс</li>
      <li style="margin-bottom:6px;"><a href="https://ccapital.pro/residence.html?utm_source=email&amp;utm_campaign=private" style="color:#8a6d3b;">ВНЖ и вторая резиденция</a> для семьи: Мальта (фикс-налог €15&nbsp;000/год), ОАЭ, Азия</li>
      <li style="margin-bottom:6px;"><a href="https://ccapital.pro/business-eu.html?utm_source=email&amp;utm_campaign=private" style="color:#8a6d3b;">Готовый бизнес в Европе</a> — реальное дело с денежным потоком и путь к ВНЖ</li>
      <li>Недвижимость (Пхукет, Европа) и зарубежные счета</li>
    </ul>
    <p style="margin:0 0 6px;"><b>С чего начать:</b></p>
    <p style="margin:0 0 4px;">1) <a href="https://t.me/ccapital26" style="color:#8a6d3b;">Telegram-дайджест</a> — коротко о санкциях, банках и юрисдикциях, без воды</p>
    <p style="margin:0 0 4px;">2) <a href="https://ccapital.pro/diagnostic.html?utm_source=email&amp;utm_campaign=private" style="color:#8a6d3b;">Бесплатная диагностика капитала</a> — 3 вопроса за 60 секунд</p>
    <p style="margin:0 0 14px;">3) Или просто ответьте на письмо — разберём вашу ситуацию под NDA (30 минут)</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Важно: мы не работаем с лицами под санкциями
    и работаем только с капиталом подтверждённого законного происхождения.</p>
  </div>
  <div style="background:#ffffff;border-top:1px solid #e5e0d5;padding:14px 26px 22px;font-size:12px;color:#6b7280;">
    <p style="margin:0 0 4px;">Charter Capital · <a href="https://ccapital.pro" style="color:#8a6d3b;">ccapital.pro</a> · Telegram <a href="https://t.me/ccapital_acces" style="color:#8a6d3b;">@ccapital_acces</a></p>
    <p style="margin:0;">Не хотите таких писем — ответьте «отписаться», и мы больше не потревожим.</p>
  </div>
</div>
</body></html>
"""

def load_set(path):
    return set(l.strip().lower() for l in path.read_text().splitlines() if l.strip()) if path.exists() else set()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--segment", required=True, choices=["A_ved", "B_private"])
    ap.add_argument("--limit", type=int, default=30, help="макс. писем за запуск (по умолчанию 30)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    user, pwd = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    if not args.dry_run and (not user or not pwd):
        sys.exit("Задайте SMTP_USER и SMTP_PASS (пароль приложения Яндекс 360).")

    sent = load_set(SENT_LOG)
    unsub = load_set(UNSUB)

    todo = []
    with open(CONTACTS, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            e = r["email"].lower()
            if r["segment"] != args.segment or e in sent or e in unsub:
                continue
            todo.append(r)
    todo = todo[: args.limit]
    print(f"К отправке ({args.segment}): {len(todo)} писем" + (" [DRY-RUN]" if args.dry_run else ""))

    tpl = TPL_A if args.segment == "A_ved" else TPL_B
    subj = SUBJECTS[args.segment]

    server = None
    if not args.dry_run:
        ctx = ssl.create_default_context()
        server = smtplib.SMTP_SSL("smtp.yandex.ru", 465, context=ctx)
        server.login(user, pwd)

    log = open(SENT_LOG, "a", newline="", encoding="utf-8")
    for i, r in enumerate(todo, 1):
        name = r["first_name"].strip()
        greet = f"Здравствуйте, {name}!" if name else "Здравствуйте!"
        body = tpl.format(greet=greet)

        if args.dry_run:
            print(f"  {i:3}. {r['email']:42} {greet}")
            continue

        msg = EmailMessage()
        msg["From"] = formataddr((FROM_NAME, user))
        msg["To"] = r["email"]
        msg["Subject"] = subj
        msg.set_content(body)
        if args.segment == "B_private":
            # multipart/alternative: plain-текст выше + HTML с картинкой-хуком
            msg.add_alternative(HTML_B.format(greet=greet, img=HOOK_IMG), subtype="html")
        try:
            server.send_message(msg)
            log.write(r["email"].lower() + "\n"); log.flush()
            print(f"  {i:3}/{len(todo)} OK  {r['email']}")
        except smtplib.SMTPResponseException as e:
            print(f"  {i:3}/{len(todo)} FAIL {r['email']}: {e.smtp_code} {e.smtp_error}")
            if e.smtp_code in (421, 451, 550):  # лимит/блок — стоп, не долбим
                print("Похоже на лимит отправки — останавливаюсь.")
                break
        if i < len(todo):
            time.sleep(random.uniform(45, 90))

    if server: server.quit()
    log.close()

if __name__ == "__main__":
    main()
