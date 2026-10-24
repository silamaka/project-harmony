from django.db import migrations, models


def reunion_to_descente(apps, schema_editor):
    """Le type de tâche "Réunion" devient "Descente" : les missions qui le
    portaient sont reprises telles quelles sous le nouveau type. Les vraies
    réunions (modèle Meeting du calendrier) ne sont pas concernées."""
    Mission = apps.get_model("missions", "Mission")
    Mission.objects.filter(task_type="reunion").update(task_type="descente")


def descente_to_reunion(apps, schema_editor):
    Mission = apps.get_model("missions", "Mission")
    Mission.objects.filter(task_type="descente").update(task_type="reunion")


class Migration(migrations.Migration):

    dependencies = [
        ("missions", "0010_remove_editos_task_type"),
    ]

    operations = [
        migrations.RunPython(reunion_to_descente, descente_to_reunion),
        migrations.AlterField(
            model_name="mission",
            name="task_type",
            field=models.CharField(
                choices=[("mission", "Mission"), ("livrable", "Livrable"), ("descente", "Descente")],
                default="mission",
                max_length=20,
            ),
        ),
    ]
