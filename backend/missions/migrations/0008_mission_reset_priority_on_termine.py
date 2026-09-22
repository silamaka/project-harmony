from django.db import migrations


def reset_priority(apps, schema_editor):
    Mission = apps.get_model("missions", "Mission")
    Mission.objects.filter(status="termine").exclude(priority="normale").update(priority="normale")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("missions", "0007_mission_sources_add_labels"),
    ]

    operations = [
        migrations.RunPython(reset_priority, noop),
    ]
