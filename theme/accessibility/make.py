# -*- coding: utf-8 -*-
"""Fill the state's website-accessibility inspection form for anshilo.com.

Keeps the Commission's own sheets and formatting intact:
  - 'הסבר על הטופס'          untouched
  - 'בדיקת נגישות לאינטרנט'  kept at the end as a blank master to duplicate
Adds:
  - 'סיכום ומקרא'            summary + legend, counts via COUNTIF formulas
  - one filled sheet per page template
"""
import os
import sys
from copy import copy

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import assess
from assess import TEMPLATES, OK, NO, NA, TBD, resolve

# form-blank.xlsx is the Commission's own file, exactly as downloaded from
# gov.il — kept here unmodified so the build is reproducible.
SRC = os.path.join(HERE, 'form-blank.xlsx')
OUT = os.path.join(HERE, 'anshilo-accessibility-form.xlsx')

MASTER = 'בדיקת נגישות לאינטרנט'
FIRST, LAST = 4, 45           # criterion rows
ARIAL = 'Arial'

wb = openpyxl.load_workbook(SRC)
master = wb[MASTER]

thin = Side(style='thin')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)


def note_style(c):
    c.font = Font(name=ARIAL, sz=9)
    c.alignment = Alignment(wrap_text=True, vertical='top', horizontal='right', readingOrder=2)
    c.border = BORDER


def header_style(c):
    c.font = Font(name=ARIAL, sz=10, b=True)
    c.alignment = Alignment(wrap_text=True, vertical='top', horizontal='right', readingOrder=2)
    c.border = BORDER
    c.fill = PatternFill('solid', fgColor='DDEBF7')


# ---------------------------------------------------------------- page sheets
made = []
for sheet_name, page_name, url in TEMPLATES:
    ws = wb.copy_worksheet(master)
    ws.title = sheet_name
    ws.sheet_view.rightToLeft = True
    # The master freezes at A43, which would pin 42 rows and hide the grid.
    # Freeze under the header row instead so it stays visible while scrolling.
    ws.freeze_panes = 'A4'

    for col, width in [('A', 27), ('B', 9.5), ('C', 21), ('D', 70), ('E', 7),
                       ('F', 13), ('G', 23), ('H', 19), ('I', 88)]:
        ws.column_dimensions[col].width = width

    ws['B1'] = page_name
    ws['B1'].font = Font(name=ARIAL, sz=10, b=True)
    ws['D1'] = url
    ws['D1'].font = Font(name=ARIAL, sz=10)

    ws['I3'] = 'הערות הבדיקה, והראיה שעליה היא מבוססת'
    header_style(ws['I3'])
    ws['I2'] = ('מקרא: תא ריק בעמודת "תוצאה" משמעו שהקריטריון טרם נבדק, והסיבה מופיעה בהערה. '
                'ראו גיליון "סיכום ומקרא".')
    ws['I2'].font = Font(name=ARIAL, sz=9, i=True)
    ws['I2'].alignment = Alignment(wrap_text=True, vertical='top', horizontal='right', readingOrder=2)
    ws.row_dimensions[2].height = 30

    for row in range(FIRST, LAST + 1):
        result, note = resolve(row, sheet_name)
        f = ws.cell(row=row, column=6)
        f.value = result if result else None
        f.font = Font(name=ARIAL, sz=10, b=bool(result))
        f.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        f.border = BORDER
        if result == OK:
            f.fill = PatternFill('solid', fgColor='E2EFDA')
        elif result == NO:
            f.fill = PatternFill('solid', fgColor='FFC7CE')
        elif result == NA:
            f.fill = PatternFill('solid', fgColor='EDEDED')
        else:
            f.fill = PatternFill('solid', fgColor='FFF2CC')   # טרם נבדק

        i = ws.cell(row=row, column=9)
        i.value = note
        note_style(i)

    made.append(sheet_name)

# ------------------------------------------------------------- summary sheet
s = wb.create_sheet('סיכום ומקרא', 1)
s.sheet_view.rightToLeft = True
for col, width in [('A', 30), ('B', 13), ('C', 13), ('D', 13), ('E', 15), ('F', 13), ('G', 60)]:
    s.column_dimensions[col].width = width


def w(cell, value, *, bold=False, size=10, wrap=False, italic=False, fill=None, center=False):
    c = s[cell]
    c.value = value
    c.font = Font(name=ARIAL, sz=size, b=bold, i=italic)
    c.alignment = Alignment(wrap_text=wrap, vertical='top', readingOrder=2,
                            horizontal='center' if center else 'right')
    if fill:
        c.fill = PatternFill('solid', fgColor=fill)
    return c


w('A1', 'בדיקת נגישות תכני אינטרנט - א.נ. שילו בע"מ', bold=True, size=14)
w('A2', 'anshilo.com | לפי תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), '
        'התשע"ג-2013, סימן ג\' תקנה 35', size=10)
w('A3', 'תאריך הבדיקה: 30.07.2026', size=10)

s.merge_cells('A4:G4')
w('A4', '⚠ נושא הבדיקה: ערכת העיצוב "shilov8theme" (מזהה 148378648655), שאיננה מפורסמת. '
        'ערכת העיצוב הפומבית במועד הבדיקה היא "שמירה 1" (מזהה 141469646927, עודכנה 28.03.2026) - '
        'ערכה אחרת, שאין בה כלל את קבצי התבנית שנבדקו כאן. כל התאמה המתועדת במסמך זה חלה על '
        'הערכה שטרם פורסמה, ולא על מה שהציבור רואה כרגע. לפני הגשה יש לפרסם את הערכה שנבדקה, '
        'או לבדוק מחדש את הערכה הפומבית - הצהרה על התאמות שאינן באוויר היא בדיוק מה שאין לעשות '
        'במסמך המוגש לפי תקנה 93(א).', wrap=True, size=10, fill='FFF2CC')
s.row_dimensions[4].height = 76

w('A5', 'מה המסמך הזה, ומה הוא איננו', bold=True, size=12)
s.merge_cells('A6:G6')
w('A6', 'זו בדיקה של קוד התבנית ושל הגדרות החנות, לפי הקריטריונים של הטופס. את הטופס הזה החייב '
        'ממלא בעצמו - גיליון ההסבר של הנציבות אינו דורש מורשה נגישות לצורך מילויו, אלא רק לצורך '
        'מתן פטור מהתאמה שאינה אפשרית טכנולוגית (ראו שורה D12 בגיליון ההסבר). ההצהרה עצמה '
        'מתפרסמת על ידי בעל האתר או מפעילו. מה שאינו יכול להיבדק מתוך הקוד - קורא מסך, מעבר '
        'מקלדת, הגדלה ל-200%, מאמת HTML והתבוננות בתמונות - נותר ריק ומופיע ברשימת המשימות '
        'שלהלן. מורשה נגישות שירות נדרש לבדיקה התקופתית אחת ל-5 שנים (טופס 9), שהיא מסמך אחר '
        'וחלה על השירות כולו ולא על האתר בלבד.', wrap=True, size=10)
s.row_dimensions[6].height = 92

w('A8', 'מקרא עמודת "תוצאה"', bold=True, size=12)
legend = [
    ('תקין',       'E2EFDA', 'נבדק, ונמצא עומד בקריטריון. ההערה בעמודה I מפרטת את הראיה - קובץ ושורה, '
                             'מדידה, או בדיקה שבוצעה בדפדפן.'),
    ('לא תקין',    'FFC7CE', 'נבדק, ונמצא שאינו עומד בקריטריון, וטרם תוקן. כרגע אחד: קריטריון 1.4.5 - '
                             'טקסט צרוב בתמונות מוצר, ובכללו מחיר ותנאי מבצע הקיימים כפיקסלים בלבד. '
                             'ההערה מפרטת את הקבצים ואת הטקסט המדויק. כשלים נוספים שנמצאו במהלך '
                             'הבדיקה כבר תוקנו ולכן אינם מופיעים כאן - ראו "מה תוקן במהלך הבדיקה".'),
    ('לא רלוונטי', 'EDEDED', 'הקריטריון אינו חל על העמוד - למשל קריטריוני אודיו ווידאו באתר שאין בו '
                             'מדיה מבוססת זמן. ההערה מסבירה על סמך מה נקבע.'),
    ('(ריק)',      'FFF2CC', 'טרם נבדק. הקריטריון דורש בדיקה שלא ניתן לבצע מתוך הקוד: קורא מסך, '
                             'מעבר מקלדת ידני, הגדלה ל-200%, מאמת HTML, או התבוננות בתמונות עצמן. '
                             'ההערה אומרת בדיוק מה נבדק ומה נותר. אלה הפריטים שהמורשה צריך להשלים.'),
]
r = 9
for label, fill, desc in legend:
    w(f'A{r}', label, bold=True, center=True, fill=fill)
    s.merge_cells(f'B{r}:G{r}')
    w(f'B{r}', desc, wrap=True, size=9)
    s.row_dimensions[r].height = 42
    r += 1

r += 1
w(f'A{r}', 'סיכום לפי עמוד', bold=True, size=12)
r += 1
head = r
for col, label in [('A', 'עמוד / מסמך'), ('B', 'תקין'), ('C', 'לא תקין'), ('D', 'לא רלוונטי'),
                   ('E', 'טרם נבדק'), ('F', 'סה"כ'), ('G', 'הפריטים שטרם נבדקו')]:
    w(f'{col}{head}', label, bold=True, center=(col != 'A' and col != 'G'), fill='DDEBF7')
r += 1

# criteria numbers per sheet that came out blank — named for the summary column
blank_labels = {}
for sheet_name, _, _ in TEMPLATES:
    nums = []
    for row in range(FIRST, LAST + 1):
        result, _ = resolve(row, sheet_name)
        if not result:
            num = str(master.cell(row=row, column=2).value or '').strip().replace('\n', '')
            if num and num not in nums:
                nums.append(num)
    blank_labels[sheet_name] = ', '.join(nums)

first_data = r
for sheet_name, page_name, _ in TEMPLATES:
    q = f"'{sheet_name}'!$F${FIRST}:$F${LAST}"
    w(f'A{r}', page_name, size=9, wrap=True)
    s[f'B{r}'] = f'=COUNTIF({q},"{OK}")'
    s[f'C{r}'] = f'=COUNTIF({q},"{NO}")'
    s[f'D{r}'] = f'=COUNTIF({q},"{NA}")'
    s[f'E{r}'] = f'=COUNTBLANK({q})'
    s[f'F{r}'] = f'=SUM(B{r}:E{r})'
    for col in 'BCDEF':
        c = s[f'{col}{r}']
        c.font = Font(name=ARIAL, sz=10)
        c.alignment = Alignment(horizontal='center', vertical='center')
    w(f'G{r}', blank_labels[sheet_name] or '-', size=9, wrap=True)
    s.row_dimensions[r].height = 30
    r += 1

last_data = r - 1
w(f'A{r}', 'סה"כ', bold=True)
for col in 'BCDEF':
    s[f'{col}{r}'] = f'=SUM({col}{first_data}:{col}{last_data})'
    c = s[f'{col}{r}']
    c.font = Font(name=ARIAL, sz=10, b=True)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.fill = PatternFill('solid', fgColor='DDEBF7')
total_row = r

r += 2
w(f'A{r}', 'מה תוקן במהלך הבדיקה הזו', bold=True, size=12)
r += 1
fixes = [
    ('1.4.3 - ניגודיות',
     'צבע ההדגשה על גבי הרקע הוורוד הבהיר נמדד 4.47:1 ו-4.06:1, מתחת ל-4.5:1 הנדרש. הוחלף בגוון '
     'כהה יותר של אותו הגוון (6.07:1 ו-5.52:1) בחמש קומפוננטות. נמדדו 36 שילובי צבע; כל השאר עומדים.'),
    ('2.4.7 - פוקוס נראה לעין',
     'שדה הכמות ביטל את מסגרת הפוקוס ולא החזיר דבר במקומה, כך שמעבר מקלדת אליו - בעמוד המוצר, '
     'בעגלה, במגירת העגלה ובהזמנה מהירה - לא הראה שום סימן. הוחזרה מסגרת 2px, במרווח שלילי כדי '
     'שהמעטפת לא תחתוך אותה.'),
    ('2.2.2 - הפסקה, עצירה, הסתרה',
     'לחצן "עצירת אנימציות ותנועה" שבתפריט הנגישות לא עצר את סרגל ההודעות: גיליון סגנון אינו יכול '
     'לעצור טיימר. הסרגל נגזר כיום מבחירת המבקר, מהגדרת הסוחר ומהגדרת מערכת ההפעלה, ונעצר ברגע '
     'הלחיצה. אותה סיבה גם מנעה מהלחצן לעצור את אנימציות פתיחת האקורדיון, וגם זה תוקן.'),
]
for title, desc in fixes:
    w(f'A{r}', title, bold=True, size=9, wrap=True)
    s.merge_cells(f'B{r}:G{r}')
    w(f'B{r}', desc, wrap=True, size=9)
    s.row_dimensions[r].height = 44
    r += 1

r += 1
w(f'A{r}', 'מה נדרש כדי לסגור את הבדיקה', bold=True, size=12)
r += 1
todo = [
    'בדיקת קורא מסך על כל תבנית עמוד - הטופס מחייב זאת מפורשות בקריטריון 1.3.2.',
    'מעבר מקלדת ידני מלא בכל עמוד, כולל מגירת העגלה, מגירת הסינון, גלריית המוצר וההזמנה המהירה '
    '(קריטריונים 2.1.1 ו-2.4.3).',
    'הגדלת התצוגה ל-200% בכל עמוד ואימות שלא נאבד תוכן או פונקציונליות (1.4.4).',
    'הרצת מאמת HTML של W3C על העמודים כפי שהם מורכבים בפועל (4.1.1).',
    'התבוננות בתמונות הבאנר והאריחים שהועלו, ואימות שאין בהן טקסט "צרוב" (1.4.5).',
    'אימות מול Shopify של נגישות מנגנון ההגנה מפני ספאם בטפסים, ושל קיום חלופה נגישה (1.1.1 CAPTCHA).',
]
for t in todo:
    s.merge_cells(f'A{r}:G{r}')
    w(f'A{r}', '•  ' + t, wrap=True, size=9)
    s.row_dimensions[r].height = 26
    r += 1

s.merge_cells(f'A{r}:G{r}')
w(f'A{r}', 'שש המשימות שלמעלה אינן דורשות מורשה נגישות - הן דורשות זמן ואת הכלים החינמיים '
           '(NVDA, Lighthouse, WAVE, validator.w3.org). מורשה נגישות שירות נדרש בשני מקרים בלבד: '
           'בקשת פטור מהתאמה שאינה אפשרית טכנולוגית, והבדיקה התקופתית אחת ל-5 שנים (טופס 9), '
           'שהיא מסמך אחר וחלה על השירות כולו.', wrap=True, size=9, italic=True)
s.row_dimensions[r].height = 42
r += 1

r += 1
s.merge_cells(f'A{r}:G{r}')
w(f'A{r}', 'רכז הנגישות: דביר ארליכמן | טלפון 058-455-4333 | דוא"ל info@anshilo.com', bold=True, size=10)

# master stays last so it reads as the blank template to duplicate
wb.move_sheet(MASTER, offset=len(wb.sheetnames))
wb.save(OUT)
print('sheets:', wb.sheetnames)
print('rows: data', first_data, '-', last_data, 'total', total_row)
print('written', OUT)
