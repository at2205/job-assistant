package com.jobhunter.config;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import com.fasterxml.jackson.databind.ObjectMapper;

@Converter(autoApply = true)
public class JsonNodeConverter implements AttributeConverter<JsonNode, String> {
    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(JsonNode attribute) {
        if (attribute == null) return "{}";
        try { return mapper.writeValueAsString(attribute); }
        catch (Exception e) { return "{}"; }
    }

    @Override
    public JsonNode convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) return mapper.createObjectNode();
        try { return mapper.readTree(dbData); }
        catch (Exception e) { return mapper.createObjectNode(); }
    }
}
