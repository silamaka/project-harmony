from rest_framework import serializers

from .models import Client, Contact


class ContactSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Contact
        fields = ["id", "name", "email", "phone", "position"]


class ClientSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    contacts = ContactSerializer(many=True, required=False)

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "industry",
            "email",
            "phone",
            "address",
            "logo_url",
            "status",
            "contacts",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def create(self, validated_data):
        contacts_data = validated_data.pop("contacts", [])
        client = Client.objects.create(**validated_data)
        for contact_data in contacts_data:
            Contact.objects.create(client=client, **contact_data)
        return client

    def update(self, instance, validated_data):
        contacts_data = validated_data.pop("contacts", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if contacts_data is not None:
            instance.contacts.all().delete()
            for contact_data in contacts_data:
                Contact.objects.create(client=instance, **contact_data)
        return instance
